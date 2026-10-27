import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../vault';
import { Icon } from './Icons';

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

  if (!isTauri()) {
    return <div className="notice notice-warn"><Icon name="info" size={16} /><span>Sincronización disponible solo en la app de escritorio.</span></div>;
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
    const r = await call(() => invoke<any>('sync_start', { name }));
    if (r) setInfo(r);
  };
  const listen = async () => {
    const r = await call(() => invoke<any>('sync_pair_listen_start', { name }));
    if (r) { setListening(true); notify('Escuchando emparejamiento...', 'info'); }
  };
  const connect = async () => {
    const r = await call(() => invoke<any>('sync_pair_connect', { name, address }));
    if (r) { setPending(r); setSas(r.sas); }
  };
  const confirm = async (deviceId: string) => {
    const r = await call(() => invoke<any>('sync_pair_confirm', { deviceId }));
    if (r) { notify('Emparejado.', 'success'); setPending(null); refreshPeers(); }
  };
  const refreshPeers = async () => {
    const r = await call(() => invoke<Peer[]>('sync_list_peers'));
    if (r) setPeers(r);
  };
  const syncAll = async () => {
    const r = await call(() => invoke<any>('sync_now', { deviceId: null, address: null }));
    if (r) { notify(`Sincronización: ${JSON.stringify(r)}`, 'info'); window.dispatchEvent(new Event('better-tracker:refresh')); }
  };
  const syncPeer = async (deviceId: string, addr?: string | null) => {
    const r = await call(() => invoke<any>('sync_now', { deviceId, address: addr ?? null }));
    if (r) { notify(`Sincronizado con ${deviceId}`, 'success'); window.dispatchEvent(new Event('better-tracker:refresh')); }
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

  const pairFromQr = async () => {
    try {
      const url = new URL(qrPayload || address);
      // support both full payload and plain address
      const addr = url.searchParams.get('address') || qrPayload;
      if (!addr) { notify('Payload inválido', 'error'); return; }
      setAddress(addr);
      const r = await call(() => invoke<any>('sync_pair_connect', { name, address: addr }));
      if (r) { setPending(r); setSas(r.sas); }
    } catch {
      // treat as plain address
      const r = await call(() => invoke<any>('sync_pair_connect', { name, address: qrPayload || address }));
      if (r) { setPending(r); setSas(r.sas); }
    }
  };

  useEffect(() => { refreshPeers(); void discover(); }, []);
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
              <button className="btn btn-ghost btn-sm" onClick={() => { setAddress(d.address ?? ''); void connect(); }}>Emparejar</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ marginBottom: 4 }}>Emparejamiento por QR</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={showQr}>Mostrar mi QR</button>
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
  );
}
