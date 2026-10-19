import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Banner from '../ui/Banner';
import Skeleton from '../ui/Skeleton';
import { useToast } from '../ui/Toast';
import {
  Globe,
  Cpu,
  Layers,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Server,
  DollarSign,
  AlertCircle
} from 'lucide-react';

const STEPS = [
  { id: 0, label: '1. Region', icon: Globe },
  { id: 1, label: '2. Instance Size', icon: Cpu },
  { id: 2, label: '3. Machine Image', icon: Layers },
  { id: 3, label: '4. Review & Launch', icon: CheckCircle2 },
];

export default function LaunchWizard() {
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  // Catalog data
  const [regions, setRegions] = useState([]);
  const [instanceTypes, setInstanceTypes] = useState([]);
  const [images, setImages] = useState([]);

  // Form state
  const [form, setForm] = useState({
    region_id: null,
    type_id: null,
    image_id: null,
    name: '',
    config: { auto_backup: false, environment: 'production' }
  });

  const [osFilter, setOsFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    async function fetchCatalog() {
      try {
        setLoadingCatalog(true);
        const [regRes, typesRes, imgRes] = await Promise.allSettled([
          api.get('/catalog/regions'),
          api.get('/catalog/instance-types'),
          api.get('/catalog/images')
        ]);

        if (!mounted) return;

        const failed = [regRes, typesRes, imgRes].find((r) => r.status === 'rejected');
        const asList = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);

        // Capacity label is derived from the number of active hosts in the region
        const regData = asList(regRes).map((r) => ({
          ...r,
          capacity: Number(r.active_hosts) === 0 ? 'full' : Number(r.active_hosts) === 1 ? 'limited' : 'plenty',
        }));
        const typesData = asList(typesRes);
        const imgData = asList(imgRes);

        if (failed) {
          setErrorBanner({ msg: 'Could not load the launch catalog.', hint: failed.reason?.msg || 'Check that the backend is running.' });
        } else if (!regData.length || !typesData.length || !imgData.length) {
          setErrorBanner({ msg: 'The launch catalog is empty.', hint: 'Load the reference data (database/07_seed.sql) with npm run db:setup.' });
        }

        setRegions(regData);
        setInstanceTypes(typesData);
        setImages(imgData);

        // Preselect defaults
        if (!form.region_id && regData.length) setForm(f => ({ ...f, region_id: regData[0].region_id }));
        if (!form.type_id && typesData.length) setForm(f => ({ ...f, type_id: typesData[0].type_id }));
        if (!form.image_id && imgData.length) setForm(f => ({ ...f, image_id: imgData[0].image_id }));
      } catch (err) {
        console.error('Error loading catalog:', err);
      } finally {
        if (mounted) setLoadingCatalog(false);
      }
    }
    fetchCatalog();
    return () => { mounted = false; };
  }, []);

  const selectedRegion = regions.find(r => r.region_id === form.region_id);
  const selectedType = instanceTypes.find(t => t.type_id === form.type_id);
  const selectedImage = images.find(i => i.image_id === form.image_id);

  const hourlyPrice = selectedType ? Number(selectedType.price_per_hour || 0) : 0;
  const monthlyPrice = (hourlyPrice * 730).toFixed(2);

  const handleLaunch = async () => {
    // Validate instance name
    const nameRegex = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
    if (!form.name || !nameRegex.test(form.name)) {
      setErrorBanner({
        msg: 'Invalid instance name.',
        hint: 'Name must be 2-40 characters, contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
      });
      return;
    }

    setSubmitting(true);
    setErrorBanner(null);

    try {
      await api.post('/instances', {
        region_id: form.region_id,
        type_id: form.type_id,
        image_id: form.image_id,
        name: form.name.toLowerCase().trim(),
        config: form.config
      });

      toast.success(`Server "${form.name}" successfully launched!`);
      navigate('/instances');
    } catch (err) {
      // Keep form intact! Display banner with msg and hint
      setErrorBanner({
        msg: err.msg || 'Failed to launch server.',
        hint: err.hint || 'Verify host capacity, organization quota, or choose another name/region.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCatalog) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
        <Skeleton height={40} width="40%" style={{ marginBottom: 20 }} />
        <Skeleton height={240} style={{ marginBottom: 20 }} />
        <Skeleton height={60} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{ marginBottom: 24 }}>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/instances')}>
          Back to Instances
        </Button>
        <h1 style={{ marginTop: 8 }}>Launch Cloud Server</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Deploy an on-demand virtual compute instance in 4 simple steps
        </p>
      </div>

      {errorBanner && (
        <Banner
          tone="danger"
          message={errorBanner.msg}
          hint={errorBanner.hint}
          onDismiss={() => setErrorBanner(null)}
        />
      )}

      {/* Step Navigator */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24,
          padding: '12px 20px',
          overflowX: 'auto',
          gap: 12
        }}
      >
        {STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? 'var(--brand)' : isDone ? 'var(--ok)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Step 0: Region Selection */}
      {step === 0 && (
        <div>
          <h2 style={{ marginBottom: 12 }}>Select Deployment Region</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            Choose the geographic location nearest to your customers for minimal network latency
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {regions.map((reg) => {
              const isSelected = form.region_id === reg.region_id;
              const isFull = reg.capacity === 'full';

              return (
                <div
                  key={reg.region_id}
                  className="card"
                  onClick={() => !isFull && setForm(f => ({ ...f, region_id: reg.region_id }))}
                  style={{
                    cursor: isFull ? 'not-allowed' : 'pointer',
                    opacity: isFull ? 0.6 : 1,
                    borderColor: isSelected ? 'var(--brand)' : 'var(--line)',
                    boxShadow: isSelected ? '0 0 0 2px var(--brand)' : 'var(--shadow-card)',
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{reg.name}</div>
                    <span
                      className={`badge badge--${reg.capacity === 'plenty' ? 'ok' : reg.capacity === 'limited' ? 'warn' : 'danger'}`}
                      style={{ fontSize: 11 }}
                    >
                      {reg.capacity}
                    </span>
                  </div>

                  <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                    {reg.code}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Active Hosts: {reg.active_hosts || 2}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 1: Size & Instance Type */}
      {step === 1 && (
        <div>
          <h2 style={{ marginBottom: 12 }}>Select Instance Hardware Size</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            Transparent pricing based on allocated vCPU, RAM, and NVMe SSD storage
          </p>

          <div className="table-wrapper responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Select</th>
                  <th>Instance Type</th>
                  <th>Family</th>
                  <th>vCPU</th>
                  <th>Memory</th>
                  <th>Disk</th>
                  <th style={{ textAlign: 'right' }}>Hourly Rate</th>
                  <th style={{ textAlign: 'right' }}>Est. Monthly</th>
                </tr>
              </thead>
              <tbody>
                {instanceTypes.map((t) => {
                  const isSelected = form.type_id === t.type_id;
                  const hrPrice = Number(t.price_per_hour || 0);

                  return (
                    <tr
                      key={t.type_id}
                      onClick={() => setForm(f => ({ ...f, type_id: t.type_id }))}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'rgba(47, 107, 255, 0.08)' : undefined
                      }}
                    >
                      <td data-label="Select">
                        <input
                          type="radio"
                          name="instance-type"
                          checked={isSelected}
                          onChange={() => setForm(f => ({ ...f, type_id: t.type_id }))}
                          aria-label={`Select ${t.name}`}
                        />
                      </td>
                      <td data-label="Instance Type">
                        <strong className="mono" style={{ color: 'var(--ink)' }}>{t.name}</strong>
                      </td>
                      <td data-label="Family" style={{ textTransform: 'capitalize' }}>
                        {t.family}
                      </td>
                      <td data-label="vCPU">{t.vcpu} Cores</td>
                      <td data-label="Memory">{t.ram_gb} GB</td>
                      <td data-label="Disk">{t.disk_gb} GB NVMe</td>
                      <td data-label="Hourly Rate" className="money">
                        ${hrPrice.toFixed(4)}/hr
                      </td>
                      <td data-label="Est. Monthly" className="money" style={{ fontWeight: 600 }}>
                        ${(hrPrice * 730).toFixed(2)}/mo
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 2: Machine Image */}
      {step === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2>Choose Operating System Image</h2>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                Curated and secured official cloud distributions
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'linux', 'windows', 'bsd'].map((fam) => (
                <button
                  key={fam}
                  type="button"
                  className={`btn btn--sm ${osFilter === fam ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setOsFilter(fam)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {fam}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {images
              .filter(img => osFilter === 'all' || img.os_family === osFilter)
              .map((img) => {
                const isSelected = form.image_id === img.image_id;

                return (
                  <div
                    key={img.image_id}
                    className="card"
                    onClick={() => setForm(f => ({ ...f, image_id: img.image_id }))}
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected ? 'var(--brand)' : 'var(--line)',
                      boxShadow: isSelected ? '0 0 0 2px var(--brand)' : 'var(--shadow-card)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{img.name}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--brand)', marginTop: 2 }}>
                      {img.version}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                      Min Disk: {img.min_disk_gb} GB · OS: <span style={{ textTransform: 'capitalize' }}>{img.os_family}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Step 3: Review & Launch */}
      {step === 3 && (
        <div>
          <h2 style={{ marginBottom: 12 }}>Review & Finalize Deployment</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            Specify server naming and review your monthly commitment
          </p>

          <div className="grid-12">
            <div className="card col-7">
              <div className="card-title" style={{ marginBottom: 16 }}>Configuration</div>

              <Input
                label="Instance Name"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value.toLowerCase() }))}
                placeholder="e.g. web-app-primary"
                required
                hint="Lowercase letters, numbers, hyphens. Unique per organization."
              />

              <div style={{ marginTop: 16 }}>
                <label className="form-label" style={{ marginBottom: 8 }}>
                  Advanced Configuration (JSON)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    id="auto-backup-cb"
                    checked={form.config?.auto_backup ?? false}
                    onChange={(e) => setForm(f => ({ ...f, config: { ...f.config, auto_backup: e.target.checked } }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <label htmlFor="auto-backup-cb" style={{ fontSize: 13, color: 'var(--ink)' }}>
                    Enable Automated Nightly Snapshots
                  </label>
                </div>

                <div
                  className="mono"
                  style={{
                    background: 'var(--bg)',
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 12,
                    border: '1px solid var(--line)',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {JSON.stringify(form.config, null, 2)}
                </div>
              </div>
            </div>

            <div className="card col-5">
              <div className="card-title" style={{ marginBottom: 16 }}>Order Summary</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Region:</span>
                  <strong>{selectedRegion?.name || 'US-East'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Instance Size:</span>
                  <span className="mono">{selectedType?.name} ({selectedType?.vcpu} vCPU, {selectedType?.ram_gb} GB)</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)' }}>Operating System:</span>
                  <span>{selectedImage?.name} {selectedImage?.version}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>Hourly Billing:</span>
                    <span className="money" style={{ fontSize: 14 }}>${hourlyPrice.toFixed(4)} / hr</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600 }}>Estimated Monthly:</span>
                    <span className="money" style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
                      ${monthlyPrice} / mo
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                  * Billed by second of active runtime. Volumes and snapshots billed per GB-month.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid var(--line)'
        }}
      >
        <Button
          variant="secondary"
          icon={ArrowLeft}
          disabled={step === 0 || submitting}
          onClick={() => setStep(s => Math.max(0, s - 1))}
        >
          Previous Step
        </Button>

        {step < 3 ? (
          <Button
            variant="primary"
            onClick={() => setStep(s => Math.min(3, s + 1))}
          >
            <span>Next: {STEPS[step + 1].label}</span>
            <ArrowRight size={16} />
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={submitting}
            disabled={submitting || !form.name}
            onClick={handleLaunch}
          >
            Launch Server Now
          </Button>
        )}
      </div>
    </div>
  );
}