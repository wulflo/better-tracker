import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../vault';
import { Icon } from './Icons';

type Peer = { device_id: string; name: string; address?: string | null };

export default function SyncPanel({ notify }: { notify: (m: string, t?: any) => void }) {
  const [name, setName] = useState('Better Tracker');
  const [info, setInfo] = useState<any>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [pending, setPending] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [sas, setSas] = useState<string | null>(null);

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
    if (r) { setSas(r.info ? null : null); setPending(r); }
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
    if (r) notify(`Sincronización: ${JSON.stringify(r)}`, 'info');
  };
  const syncPeer = async (deviceId: string, addr?: string | null) => {
    const r = await call(() => invoke<any>('sync_now', { deviceId, address: addr ?? null }));
    if (r) notify(`Sincronizado con ${deviceId}`, 'success');
  };

  useEffect(() => { refreshPeers(); }, []);

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
          <span>SAS: <strong>{pending.sas}</strong> · {pending.name} ({pending.device_id})</span>
          <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => confirm(pending.device_id)}>Confirmar</button>
        </div>
      )}
      <div className="settings-row" style={{ marginTop: 8 }}>
        <span className="muted">Emparejar con dirección</span>
        <input className="input" placeholder="192.168.1.10:45678" value={address} onChange={e => setAddress(e.target.value)} style={{ maxWidth: 220 }} />
        <button className="btn btn-ghost btn-sm" onClick={connect}>Conectar</button>
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
