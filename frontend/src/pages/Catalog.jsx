import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Table, Tabs, money, useLoad } from '../components/ui.jsx';

export default function Catalog() {
  const [tab, setTab] = useState('types');
  const [types] = useLoad(() => api('/catalog/instance-types'));
  const [regions] = useLoad(() => api('/catalog/regions'));
  const [images] = useLoad(() => api('/catalog/images'));

  return (
    <>
      <h1>Catalog</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['types', 'Instance types'], ['regions', 'Regions'], ['images', 'Images']]} />
      {tab === 'types' && (
        <Table rows={types || []} cols={[
          { label: 'Type', render: (t) => <strong>{t.name}</strong> },
          { label: 'Family', key: 'family' },
          { label: 'vCPU', key: 'vcpu' },
          { label: 'RAM', render: (t) => `${t.ram_gb} GB` },
          { label: 'Disk', render: (t) => `${t.disk_gb} GB` },
          { label: 'Per hour', render: (t) => money(t.price_per_hour) },
          { label: 'Per month (730 h)', render: (t) => money(t.price_per_month, 2) },
        ]} />
      )}
      {tab === 'regions' && (
        <Table rows={regions || []} cols={[
          { label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
          { label: 'Location', render: (r) => `${r.name}, ${r.country}` },
          { label: 'Active hosts', key: 'active_hosts' },
        ]} />
      )}
      {tab === 'images' && (
        <Table rows={images || []} cols={[
          { label: 'Image', render: (i) => <strong>{i.name} {i.version}</strong> },
          { label: 'OS family', render: (i) => <Badge kind="info">{i.os_family}</Badge> },
          { label: 'Minimum disk', render: (i) => `${i.min_disk_gb} GB` },
        ]} />
      )}
    </>
  );
}
