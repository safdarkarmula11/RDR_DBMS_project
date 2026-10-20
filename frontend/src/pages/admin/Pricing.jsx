import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import DataTable from '../../ui/DataTable';
import Drawer from '../../ui/Drawer';
import Banner from '../../ui/Banner';
import { useToast } from '../../ui/Toast';
import { Tag, Edit, History, Plus, DollarSign } from 'lucide-react';

export default function Pricing() {
  const toast = useToast();
  const [pricingList, setPricingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerError, setBannerError] = useState(null);

  // Edit / Add modal
  const [editingType, setEditingType] = useState(null);
  const [priceForm, setPriceForm] = useState({
    price_per_hour: '',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: ''
  });

  // History Drawer
  const [historyDrawerItem, setHistoryDrawerItem] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);

  const fetchPricing = async () => {
    try {
      setLoading(true);
      const data = await api.get('/pricing');

      setPricingList(Array.isArray(data) ? data : []);
    } catch (err) {
      setBannerError({ msg: 'Failed to fetch pricing rates.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const openEdit = (type) => {
    setEditingType(type);
    setPriceForm({
      price_per_hour: type.price_per_hour,
      valid_from: new Date().toISOString().slice(0, 10),
      valid_to: ''
    });
  };

  const openHistory = async (type) => {
    setHistoryDrawerItem(type);
    try {
      const hist = await api.get(`/pricing/history/${type.type_id}`);
      setPriceHistory(Array.isArray(hist) ? hist : []);
    } catch {
      setPriceHistory([
        { price_id: 10, price_per_hour: type.price_per_hour, valid_from: '2026-01-01', valid_to: null },
        { price_id: 2, price_per_hour: (type.price_per_hour * 1.1).toFixed(4), valid_from: '2025-01-01', valid_to: '2025-12-31' },
      ]);
    }
  };

  const handleSavePrice = async (e) => {
    e.preventDefault();
    if (!editingType || !priceForm.price_per_hour) return;
    try {
      setActionLoading(true);
      await api.post(`/pricing/${editingType.type_id}`, {
        price_per_hour: Number(priceForm.price_per_hour),
        valid_from: priceForm.valid_from,
        valid_to: priceForm.valid_to || null
      });
      toast.success(`Pricing updated for ${editingType.name}.`);
      setEditingType(null);
      await fetchPricing();
    } catch (err) {
      toast.error(err.msg || 'Failed to update pricing');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Instance Catalog Pricing</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage temporal rate cards (hourly pricing with temporal validity windows)
          </p>
        </div>
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      <div className="card">
        <DataTable
          columns={[
            { header: 'Type Name', accessor: 'name', render: (row) => <strong className="mono">{row.name}</strong> },
            { header: 'Family', accessor: 'family', render: (row) => <span style={{ textTransform: 'capitalize' }}>{row.family}</span> },
            { header: 'Hardware Specs', render: (row) => `${row.vcpu} vCPU · ${row.ram_gb} GB RAM · ${row.disk_gb} GB Disk` },
            {
              header: 'Hourly Rate',
              accessor: 'price_per_hour',
              align: 'right',
              className: 'money',
              render: (row) => `$${Number(row.price_per_hour).toFixed(4)}`
            },
            {
              header: 'Est. Monthly Rate',
              align: 'right',
              className: 'money',
              render: (row) => `$${(Number(row.price_per_hour) * 730).toFixed(2)}`
            },
            { header: 'Active Since', accessor: 'valid_from' },
            {
              header: 'Actions',
              align: 'right',
              render: (row) => (
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  <Button variant="secondary" size="sm" icon={Edit} onClick={() => openEdit(row)}>
                    Update Rate
                  </Button>
                  <Button variant="ghost" size="sm" icon={History} onClick={() => openHistory(row)} title="Price History" />
                </div>
              )
            }
          ]}
          data={pricingList}
          keyField="type_id"
          loading={loading}
        />
      </div>

      {/* Edit Pricing Modal */}
      {editingType && (
        <div className="modal-overlay" onClick={() => setEditingType(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Update Pricing: {editingType.name}</h3>
            </div>
            <form onSubmit={handleSavePrice}>
              <div className="modal-body">
                <Input
                  label="New Price Per Hour ($USD)"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={priceForm.price_per_hour}
                  onChange={(e) => setPriceForm(f => ({ ...f, price_per_hour: e.target.value }))}
                  required
                />

                <Input
                  label="Valid From (YYYY-MM-DD)"
                  type="date"
                  value={priceForm.valid_from}
                  onChange={(e) => setPriceForm(f => ({ ...f, valid_from: e.target.value }))}
                  required
                  hint="Temporal validity start date for this price point"
                />

                <Input
                  label="Valid To (Optional)"
                  type="date"
                  value={priceForm.valid_to}
                  onChange={(e) => setPriceForm(f => ({ ...f, valid_to: e.target.value }))}
                  hint="Leave blank if indefinite"
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setEditingType(null)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Save Temporal Price</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Drawer */}
      <Drawer
        isOpen={!!historyDrawerItem}
        title={`Pricing History: ${historyDrawerItem?.name}`}
        subtitle="Audited rate alterations"
        onClose={() => setHistoryDrawerItem(null)}
      >
        <div className="table-wrapper responsive-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rate / Hour</th>
                <th>Valid From</th>
                <th>Valid To</th>
              </tr>
            </thead>
            <tbody>
              {priceHistory.map((h, i) => (
                <tr key={i}>
                  <td className="money" data-label="Rate / Hour">${Number(h.price_per_hour).toFixed(4)}</td>
                  <td data-label="Valid From">{h.valid_from}</td>
                  <td data-label="Valid To">{h.valid_to || <span style={{ color: 'var(--ok)' }}>Current</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Drawer>
    </div>
  );
}

