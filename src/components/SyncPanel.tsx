import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../vault';
import { Icon } from './Icons';
import BarcodeScanner from './BarcodeScanner';

type Peer = { device_id: string; name: string; address?: string | null };
type Discovered = { name?: string; address?: string; device_id?: string; port?: number };

export default function SyncPanel({ notify }: { notify: (m: string, t?: any) => void }) {
  const [name, setName] = useState('Better Tracker');
  const [info, setInfo] = useState<any>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [pending, setPending] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [sas, setSas] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState('');
  const [listening, setListening] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  if (!isTauri()) {
    return <div className="notice notice-warn"><Icon name="info" size={16} /><span>La sincronización P2P necesita la app instalada; en el modo navegador no hay acceso a la red local ni a la bóveda compartida.</span></div>;
  }

  const call = async (fn: () => Promise<any>, ok?: string) => {
    try {
      const r = await fn();
      if (ok) notify(ok, 'success');
      return r;
    } catch (e) {
      notify(String(e), 'error');
      return null;
    }
  };

  const start = async () => {
    const r = await call(() => invoke<any>('sync_start', { name }), 'Servidor de sincronización iniciado.');
    if (r) { setInfo(r); await refreshPeers(); }
  };
  const listen = async () => {
    const r = await call(() => invoke<any>('sync_pair_listen_start', { name }));
    if (r) { setInfo(r.info); setListening(true); notify('Escuchando emparejamiento...', 'info'); }
  };
  const connectTo = async (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) {
      notify('Escribe la dirección IP del otro dispositivo.', 'error');
      return;
    }
    setAddress(trimmed);
    const r = await call(() => invoke<any>('sync_pair_connect', { name, address: trimmed }));
    if (r) { setPending(r); setSas(r.sas); }
  };
  const connect = () => connectTo(address);
  const confirm = async (deviceId: string) => {
    const r = await call(() => invoke<any>('sync_pair_confirm', { deviceId }));
    if (r) { notify('Emparejado.', 'success'); setPending(null); refreshPeers(); }
  };
  const refreshPeers = async () => {
    const r = await call(() => invoke<Peer[]>('sync_list_peers'));
    if (r) setPeers(r);
  };
  const reportSummary = (reports: any[], errors: string[]) => {
    const sent = reports.reduce((sum, report) => sum + (Number(report.sent) || 0), 0);
    const received = reports.reduce((sum, report) => sum + (Number(report.received) || 0), 0);
    if (errors.length) {
      notify(`Sincronización con errores: ${errors.join(' | ')}`, 'error');
      return false;
    }
    if (!reports.length) {
      notify('No hubo dispositivos que sincronizar.', 'info');
      return false;
    }
    notify(`Sincronizado: ${sent} evento(s) enviados y ${received} recibidos en ${reports.length} dispositivo(s).`, 'success');
    return true;
  };

  const syncAll = async () => {
    try {
      const r = await invoke<any>('sync_now', { deviceId: null, address: null });
      reportSummary(r?.reports ?? [], r?.errors ?? []);
      window.dispatchEvent(new Event('better-tracker:refresh'));
    } catch (e) {
      notify(`No se pudo sincronizar: ${String(e)}`, 'error');
    }
  };
  const syncPeer = async (deviceId: string, addr?: string | null) => {
    try {
      const r = await invoke<any>('sync_now', { deviceId, address: addr ?? null });
      const ok = reportSummary(r?.reports ?? [], r?.errors ?? []);
      if (ok) window.dispatchEvent(new Event('better-tracker:refresh'));
    } catch (e) {
      notify(`No se pudo sincronizar: ${String(e)}`, 'error');
    }
  };

  const discover = async () => {
    const r = await call(() => invoke<any[]>('sync_discover', { durationMs: 2000 }));
    if (r) setDiscovered(r as Discovered[]);
  };

  const showQr = async () => {
    try {
      const li = await invoke<any>('sync_local_info', { name });
      const addr = (li?.addresses?.[0] ?? '127.0.0.1') + ':14242';
      const payload = `better-tracker://pair?address=${encodeURIComponent(addr)}&name=${encodeURIComponent(name)}&device_id=${encodeURIComponent(li?.identity?.device_id ?? '')}`;
      setQrPayload(payload);
      const svg = await invoke<string>('generate_qr_svg', { text: payload });
      setQrSvg(svg);
    } catch (e) {
      notify(String(e), 'error');
    }
  };

  const pairFromPayload = async (raw: string) => {
    const payload = raw.trim();
    if (!payload) {
      notify('El QR no contiene una dirección de emparejamiento.', 'error');
      return;
    }
    let addr = payload;
    try {
      const url = new URL(payload);
      addr = url.searchParams.get('address') || payload;
    } catch {
      // También aceptamos una dirección simple (IP:puerto) sin esquema.
    }
    addr = addr.trim();
    if (!addr) {
      notify('El QR no contiene una dirección válida.', 'error');
      return;
    }
    setQrPayload(payload);
    setAddress(addr);
    const r = await call(() => invoke<any>('sync_pair_connect', { name, address: addr }));
    if (r) { setPending(r); setSas(r.sas); }
  };

  const pairFromQr = () => pairFromPayload(qrPayload || address);

  useEffect(() => {
    refreshPeers();
    invoke<any>('sync_local_info', { name }).then(setInfo).catch(() => {});
    void discover();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!listening) return;
    const id = window.setInterval(async () => {
      try {
        const p = await invoke<any>('sync_pair_pending');
        if (p) { setPending(p); setSas(p.sas); setListening(false); }
      } catch {}
    }, 1000);
    return () => window.clearInterval(id);
  }, [listening]);

  return (
    <>
    <div className="settings-block">
      <div className="settings-row"><span className="muted">Nombre del dispositivo</span>
        <input className="input" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 220 }} />
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm" onClick={start}>Iniciar servidor</button>
        <button className="btn btn-ghost btn-sm" onClick={listen}>Escuchar emparejamiento</button>
        <button className="btn btn-ghost btn-sm" onClick={refreshPeers}>Actualizar peers</button>
        <button className="btn btn-primary btn-sm" onClick={syncAll}>Sincronizar todo</button>
        <button className="btn btn-ghost btn-sm" onClick={discover}>Buscar en LAN</button>
      </div>
      {info && (
        <div className="notice notice-info" style={{ marginTop: 8 }}>
          <Icon name="info" size={16} />
          <span>Direcciones: {(info.addresses || []).join(', ')} · puerto {info.sync_port}</span>
        </div>
      )}
      {pending && (
        <div className="notice notice-warn" style={{ marginTop: 8 }}>
          <Icon name="info" size={16} />
          <span>SAS: <strong>{pending.sas ?? sas}</strong> · {pending.name} ({pending.device_id})</span>
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => confirm(pending.device_id)}>Confirmar</button>
        </div>
      )}
      <div className="settings-row" style={{ marginTop: 8 }}>
        <span className="muted">Emparejar con dirección</span>
        <input className="input" placeholder="192.168.1.10:45678" value={address} onChange={e => setAddress(e.target.value)} style={{ maxWidth: 220 }} />
        <button className="btn btn-ghost btn-sm" onClick={connect}>Conectar</button>
      </div>

      {discovered.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="muted" style={{ marginBottom: 4 }}>Descubiertos en LAN</div>
          {discovered.map((d, i) => (
            <div key={i} className="settings-row">
              <span className="value">{d.name ?? 'Dispositivo'} <span className="mono hint">{d.address}</span></span>
              <button className="btn btn-ghost btn-sm" onClick={() => void connectTo(d.address ?? '')}>Emparejar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ marginBottom: 4 }}>Emparejamiento por QR</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={showQr}>Mostrar mi QR</button>
          <button className="btn btn-tonal btn-sm" onClick={() => setScannerOpen(true)}>
            <Icon name="scan" size={14} /> Escanear QR
          </button>
        </div>
        {qrSvg && (
          <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
        )}
        {qrPayload && (
          <div className="hint mono" style={{ marginTop: 4, wordBreak: 'break-all' }}>{qrPayload}</div>
        )}
        <div className="settings-row" style={{ marginTop: 8 }}>
          <span className="muted">Pegar payload QR</span>
          <input className="input" placeholder="better-tracker://pair?..." value={qrPayload} onChange={e => setQrPayload(e.target.value)} style={{ maxWidth: 320 }} />
          <button className="btn btn-ghost btn-sm" onClick={pairFromQr}>Emparejar</button>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div className="muted" style={{ marginBottom: 4 }}>Peers emparejados</div>
        {peers.length === 0 && <span className="hint">Sin peers.</span>}
        {peers.map(p => (
          <div key={p.device_id} className="settings-row">
            <span className="value">{p.name} <span className="mono hint">{p.device_id.slice(0, 8)}</span></span>
            <button className="btn btn-ghost btn-sm" onClick={() => syncPeer(p.device_id, p.address)}>Sincronizar</button>
          </div>
        ))}
      </div>
    </div>

    {scannerOpen && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Escanear QR de emparejamiento">
        <div className="modal" style={{ width: 'min(520px, 100%)' }}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Escanear QR de emparejamiento</div>
              <div className="card-sub">Abre la cámara y apunta al QR que muestra el otro dispositivo en «Mostrar mi QR».</div>
            </div>
            <button className="btn-icon" aria-label="Cerrar escáner" onClick={() => setScannerOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="modal-body">
            <BarcodeScanner
              kind="qr"
              onResult={(payload) => {
                setScannerOpen(false);
                void pairFromPayload(payload);
              }}
              onClose={() => setScannerOpen(false)}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
