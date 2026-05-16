import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Stack, Grid,
  Alert, LinearProgress, alpha, Divider, IconButton,
  InputAdornment, Chip, Autocomplete, CircularProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Visibility as ShowIcon, VisibilityOff as HideIcon,
  Refresh as RefreshIcon,
  CloudDownload as FetchIcon,
  CheckCircle as DynamicIcon,
  Warning as FallbackIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import {
  getLLMConfig, saveLLMConfig, getLLMModels,
  getEmbedConfig, saveEmbedConfig, getEmbedModels, saveFallbackConfig, toggleEmbedMode,
} from '../api/knowledge';
import type {
  LLMConfig, EmbedConfig, ProviderOption, DynamicModels,
  SaveLLMRequest, SaveEmbedRequest, SaveFallbackRequest,
} from '../api/knowledge';

// ── Model source badge ────────────────────────────────────────────
function ModelBadge({ dm }: { dm: DynamicModels | null }) {
  if (!dm) return null;
  if (dm.source === 'dynamic') {
    return <Chip icon={<DynamicIcon />} label={`API 获取成功，${dm.models.length} 个模型可用`} size="small"
      sx={{ bgcolor: alpha('#69F0AE', 0.1), color: '#69F0AE', fontWeight: 500 }} />;
  }
  if (dm.source === 'preset' || dm.source === 'fallback' || (dm.source === 'error' && dm.models.length > 0)) {
    return <Chip icon={<FallbackIcon />} label={`API 获取失败，已使用预设列表 (${dm.models.length} 个)`} size="small"
      sx={{ bgcolor: alpha('#FFD740', 0.12), color: '#FFD740', fontWeight: 500 }} />;
  }
  return <Chip icon={<ErrorIcon />} label={`获取失败: ${dm.error || '未知错误'}`} size="small"
    sx={{ bgcolor: alpha('#FF5252', 0.1), color: '#FF5252', fontWeight: 500 }} />;
}

// ── Simple key field ──────────────────────────────────────────────
function KeyField({ label, value, onChange, savedMask, show, setShow }: {
  label: string; value: string; onChange: (v: string) => void;
  savedMask?: string; show: boolean; setShow: (v: boolean) => void;
}) {
  return (
    <TextField size="small" label={label}
      type={show ? 'text' : 'password'}
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={savedMask ? `${savedMask} （填写以覆盖）` : `输入 ${label}`}
      slotProps={{ input: { endAdornment: (
        <InputAdornment position="end">
          <IconButton size="small" onClick={() => setShow(!show)}>
            {show ? <HideIcon /> : <ShowIcon />}
          </IconButton>
        </InputAdornment>
      )}}} />
  );
}

// ── Main ──────────────────────────────────────────────────────────
export default function SettingsPage() {
  // LLM
  const [llm, setLLM] = useState<LLMConfig | null>(null);
  const [llmF, setLLMF] = useState({ provider: '', api_key: '', model: '' });
  const [llmModels, setLLMModels] = useState<DynamicModels | null>(null);
  const [llmLoading, setLLMLoading] = useState(false);
  const [llmFetching, setLLMFetching] = useState(false);
  const [llmMsg, setLLMMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [showLK, setShowLK] = useState(false);

  // Embed primary
  const [emb, setEmb] = useState<EmbedConfig | null>(null);
  const [embMode, setEmbMode] = useState<'provider' | 'local'>('provider');
  const [embF, setEmbF] = useState({ provider: '', api_key: '', model: '', cf: '', local_url: '' });
  const [embModels, setEmbModels] = useState<DynamicModels | null>(null);
  const [embLoading, setEmbLoading] = useState(false);
  const [embFetching, setEmbFetching] = useState(false);
  const [embMsg, setEmbMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [showEK, setShowEK] = useState(false);

  // Embed fallback — completely independent, only for provider mode
  const [fbF, setFbF] = useState({ provider: '', api_key: '', model: '', cf: '' });
  const [fbModels, setFbModels] = useState<DynamicModels | null>(null);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbFetching, setFbFetching] = useState(false);
  const [fbMsg, setFbMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [showFK, setShowFK] = useState(false);

  const provCloud = emb?.available_providers?.filter(p => p.type !== 'local') || [];
  const provLocal = emb?.available_providers?.filter(p => p.type === 'local') || [];

  // ── Load configs ──
  const loadLLM = async () => {
    try {
      const r = await getLLMConfig();
      setLLM(r.data);
      setLLMF({ provider: r.data.provider, api_key: '', model: r.data.model });
    } catch {}
  };
  const loadEmb = async () => {
    try {
      const r = await getEmbedConfig();
      setEmb(r.data);
      const m = r.data.mode || (r.data.use_local ? 'local' : 'provider');
      setEmbMode(m);
      setEmbF({ provider: r.data.provider, api_key: '', model: r.data.model, cf: r.data.cf_account_id || '', local_url: r.data.local_url || '' });
      setFbF({ provider: r.data.fallback_provider || '', api_key: '', model: r.data.fallback_model || '', cf: r.data.fallback_cf_account_id || '' });
    } catch {}
  };
  useEffect(() => { loadLLM(); loadEmb(); }, []);

  // ── Fetch models: auto-save first if form has a new key ──
  const fetchLLM = async () => {
    setLLMFetching(true); setLLMMsg(null);
    try {
      if (llmF.api_key) await saveLLMConfig({ provider: llmF.provider, model: llmF.model || llm?.model || '', api_key: llmF.api_key });
      const r = await getLLMModels(llmF.provider || undefined);
      setLLMModels(r.data);
    } catch (e: any) { setLLMMsg({ t: e.response?.data?.error || '获取失败', ok: false }); }
    finally { setLLMFetching(false); }
  };
  const fetchEmb = async () => {
    setEmbFetching(true); setEmbMsg(null);
    try {
      if (embMode === 'local') {
        if (embF.local_url) await saveEmbedConfig({ mode: 'local', provider: embF.provider, model: embF.model || emb?.model || '', local_url: embF.local_url });
      } else {
        if (embF.api_key) await saveEmbedConfig({ mode: 'provider', provider: embF.provider, model: embF.model || emb?.model || '', api_key: embF.api_key, cf_account_id: embF.cf || undefined });
      }
      const r = await getEmbedModels(false);
      setEmbModels(r.data);
    } catch (e: any) { setEmbMsg({ t: e.response?.data?.error || '获取失败', ok: false }); }
    finally { setEmbFetching(false); }
  };
  const fetchFb = async () => {
    setFbFetching(true); setFbMsg(null);
    try {
      if (fbF.api_key) await saveFallbackConfig({ provider: fbF.provider, model: fbF.model || emb?.fallback_model || '', api_key: fbF.api_key, cf_account_id: fbF.cf || undefined });
      const r = await getEmbedModels(true);
      setFbModels(r.data);
    } catch (e: any) { setFbMsg({ t: e.response?.data?.error || '获取失败', ok: false }); }
    finally { setFbFetching(false); }
  };

  // ── Save (explicit save only — key is required, will be cleared after) ──
  // Helpers: key is "available" if form has it OR saved (masked) exists
  const llmHasKey = !!(llmF.api_key || llm?.api_key);
  const embValid = embMode === 'local'
    ? !!(embF.local_url)
    : !!(embF.api_key || emb?.api_key);
  const fbHasKey = !!(fbF.api_key || emb?.fallback_api_key);

  const saveLLM = async () => {
    if (!llmF.provider || !llmF.model || !llmHasKey) return;
    setLLMLoading(true); setLLMMsg(null);
    try {
      const r = await saveLLMConfig({ provider: llmF.provider, model: llmF.model, api_key: llmF.api_key });
      setLLM(r.data); if (llmF.api_key) setLLMF(p => ({ ...p, api_key: '' }));
      setLLMMsg({ t: 'LLM 配置已保存', ok: true });
    } catch (e: any) { setLLMMsg({ t: e.response?.data?.error || '保存失败', ok: false }); }
    finally { setLLMLoading(false); }
  };
  const saveEmb = async () => {
    if (!embF.provider || !embF.model || !embValid) return;
    setEmbLoading(true); setEmbMsg(null);
    try {
      const r = embMode === 'local'
        ? await saveEmbedConfig({ mode: 'local', provider: embF.provider, model: embF.model, local_url: embF.local_url })
        : await saveEmbedConfig({ mode: 'provider', provider: embF.provider, model: embF.model, api_key: embF.api_key, cf_account_id: embF.cf || undefined });
      setEmb(r.data);
      // Keep current mode — PUT response may not reflect actual saved state
      if (embMode === 'provider' && embF.api_key) setEmbF(p => ({ ...p, api_key: '' }));
      const w: string[] = [];
      if (r.data.warning) w.push(r.data.warning);
      if (r.data.cache_cleared) w.push('Embedding 缓存已清空');
      setEmbMsg({ t: w.length ? w.join('；') : (embMode === 'local' ? '本地配置已保存' : '主 Provider 已保存'), ok: true });
    } catch (e: any) { setEmbMsg({ t: e.response?.data?.error || '保存失败', ok: false }); }
    finally { setEmbLoading(false); }
  };
  const saveFb = async () => {
    if (!fbF.provider || !fbF.model || !fbHasKey) return;
    setFbLoading(true); setFbMsg(null);
    try {
      const r = await saveFallbackConfig({ provider: fbF.provider, model: fbF.model, api_key: fbF.api_key, cf_account_id: fbF.cf || undefined });
      setEmb(r.data); if (fbF.api_key) setFbF(p => ({ ...p, api_key: '' }));
      setFbMsg({ t: '备用 Provider 已保存', ok: true });
    } catch (e: any) { setFbMsg({ t: e.response?.data?.error || '保存失败', ok: false }); }
    finally { setFbLoading(false); }
  };

  // ── Model options helper ──
  const opts = (dm: DynamicModels | null, prov: string, cfg: LLMConfig | EmbedConfig | null) =>
    dm?.models || cfg?.available_providers?.find((p: ProviderOption) => p.id === prov)?.models || [];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>API 配置</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        手动配置 LLM 分类和 Embedding 向量化的服务商、API Key 与模型。获取模型为只读查询，不会保存配置
      </Typography>

      <Grid container spacing={4}>
        {/* ── LLM ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            {llmLoading && <LinearProgress />}
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>LLM 分类配置</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                用于文档元数据分类
              </Typography>
              {llm && (
                <Stack spacing={2.5}>
                  <FormControl size="small"><InputLabel>服务商</InputLabel>
                    <Select value={llmF.provider} label="服务商" onChange={e => { setLLMF(p => ({ ...p, provider: e.target.value })); setLLMModels(null); }}>
                      {llm.available_providers.map(pr => <MenuItem key={pr.id} value={pr.id}>{pr.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <KeyField label="API Key" value={llmF.api_key} onChange={v => setLLMF(p => ({ ...p, api_key: v }))} savedMask={llm.api_key} show={showLK} setShow={setShowLK} />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button variant="outlined" size="small" startIcon={llmFetching ? <CircularProgress size={16} /> : <FetchIcon />}
                      onClick={fetchLLM} disabled={llmFetching || !llmF.provider}>
                      {llmFetching ? '获取中...' : '获取可用模型'}
                    </Button>
                    <ModelBadge dm={llmModels} />
                  </Stack>
                  <Autocomplete freeSolo options={opts(llmModels, llmF.provider, llm)}
                    value={llmF.model} onChange={(_, v) => setLLMF(p => ({ ...p, model: v || '' }))}
                    onInputChange={(_, v) => setLLMF(p => ({ ...p, model: v }))}
                    renderInput={params => <TextField {...params} size="small" label="模型名称" placeholder="手动输入或从列表选择" />} />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button variant="contained" startIcon={<SaveIcon />} onClick={saveLLM}
                      disabled={llmLoading || !llmF.provider || !llmF.model || !llmHasKey}>保存配置</Button>
                    <IconButton size="small" onClick={loadLLM} sx={{ color: 'text.secondary' }}><RefreshIcon fontSize="small" /></IconButton>
                  </Stack>
                  {llmMsg && <Alert severity={llmMsg.ok ? 'success' : 'error'} onClose={() => setLLMMsg(null)}>{llmMsg.t}</Alert>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* ── Embedding ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            {(embLoading || fbLoading) && <LinearProgress />}
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>Embedding 配置</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                {embMode === 'local' ? '本地部署模式 — 使用 Ollama / LM Studio 等本地 Embedding 服务' : '云服务商模式 — 主/备双 Provider 自动容灾'}
              </Typography>
              {emb && (
                <Stack spacing={3}>
                  {/* ═══ Mode toggle ═══ */}
                  <Stack direction="row" spacing={1} sx={{ bgcolor: alpha('#fff', 0.03), borderRadius: 2, p: 0.5 }}>
                    {(['provider', 'local'] as const).map(m => {
                      const active = embMode === m;
                      return (
                        <Button key={m} size="small"
                          variant={active ? 'contained' : 'text'}
                          onClick={async () => {
                            if (active) return;
                            try {
                              await toggleEmbedMode(m === 'local');
                              await loadEmb();
                            } catch {}
                          }}
                          sx={{ flex: 1, textTransform: 'none', fontWeight: 600 }}>
                          {m === 'provider' ? '云服务商' : '本地部署'}
                        </Button>
                      );
                    })}
                  </Stack>

                  {embMode === 'provider' ? (
                    <>
                      {/* ═══ Provider mode ═══ */}
                      <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 2 }}>
                          主 Provider
                        </Typography>
                        <Stack spacing={2.5}>
                          <FormControl size="small"><InputLabel>服务商</InputLabel>
                            <Select value={embF.provider} label="服务商" onChange={e => { setEmbF(p => ({ ...p, provider: e.target.value })); setEmbModels(null); }}>
                              {provCloud.map(pr => <MenuItem key={pr.id} value={pr.id}>{pr.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <KeyField label="API Key" value={embF.api_key} onChange={v => setEmbF(p => ({ ...p, api_key: v }))} savedMask={emb.api_key} show={showEK} setShow={setShowEK} />
                          {embF.provider === 'cloudflare' && (
                            <TextField size="small" label="Cloudflare Account ID" value={embF.cf} onChange={e => setEmbF(p => ({ ...p, cf: e.target.value }))}
                              placeholder={emb.cf_account_id ? emb.cf_account_id + ' （填写以覆盖）' : '输入 Account ID'} helperText="Cloudflare Workers AI 必填" />
                          )}
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button variant="outlined" size="small" startIcon={embFetching ? <CircularProgress size={16} /> : <FetchIcon />}
                              onClick={fetchEmb} disabled={embFetching || !embF.provider}>
                              {embFetching ? '获取中...' : '获取可用模型'}
                            </Button>
                            <ModelBadge dm={embModels} />
                          </Stack>
                          <Autocomplete freeSolo options={opts(embModels, embF.provider, emb)}
                            value={embF.model} onChange={(_, v) => setEmbF(p => ({ ...p, model: v || '' }))}
                            onInputChange={(_, v) => setEmbF(p => ({ ...p, model: v }))}
                            renderInput={params => <TextField {...params} size="small" label="模型名称" placeholder="手动输入或从列表选择" />} />
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Button variant="contained" startIcon={<SaveIcon />} onClick={saveEmb}
                              disabled={embLoading || !embF.provider || !embF.model || !embValid}>保存主 Provider</Button>
                            <IconButton size="small" onClick={loadEmb} sx={{ color: 'text.secondary' }}><RefreshIcon fontSize="small" /></IconButton>
                          </Stack>
                          {embMsg && <Alert severity={embMsg.ok ? 'success' : 'error'} onClose={() => setEmbMsg(null)}>{embMsg.t}</Alert>}
                        </Stack>
                      </Box>

                      <Divider />

                      {/* ═══ Fallback ═══ */}
                      <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 2 }}>
                          备用 Provider（主遇 429/5xx 自动切换）
                        </Typography>
                        <Stack spacing={2.5}>
                          <FormControl size="small"><InputLabel>备用服务商</InputLabel>
                            <Select value={fbF.provider} label="备用服务商" onChange={e => { setFbF(p => ({ ...p, provider: e.target.value })); setFbModels(null); }}>
                              <MenuItem value="">不使用</MenuItem>
                              {provCloud.map(pr => <MenuItem key={pr.id} value={pr.id}>{pr.name}</MenuItem>)}
                            </Select>
                          </FormControl>
                          {fbF.provider && (
                            <>
                              <KeyField label="备用 API Key" value={fbF.api_key} onChange={v => setFbF(p => ({ ...p, api_key: v }))} savedMask={emb.fallback_api_key} show={showFK} setShow={setShowFK} />
                              {fbF.provider === 'cloudflare' && (
                                <TextField size="small" label="备用 Cloudflare Account ID" value={fbF.cf} onChange={e => setFbF(p => ({ ...p, cf: e.target.value }))}
                                  placeholder={emb.fallback_cf_account_id ? emb.fallback_cf_account_id + ' （填写以覆盖）' : '输入 Account ID'} helperText="Cloudflare Workers AI 必填" />
                              )}
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Button variant="outlined" size="small" startIcon={fbFetching ? <CircularProgress size={16} /> : <FetchIcon />}
                                  onClick={fetchFb} disabled={fbFetching || !fbF.provider}>
                                  {fbFetching ? '获取中...' : '获取可用模型'}
                                </Button>
                                <ModelBadge dm={fbModels} />
                              </Stack>
                              <Autocomplete freeSolo options={opts(fbModels, fbF.provider, emb)}
                                value={fbF.model} onChange={(_, v) => setFbF(p => ({ ...p, model: v || '' }))}
                                onInputChange={(_, v) => setFbF(p => ({ ...p, model: v }))}
                                renderInput={params => <TextField {...params} size="small" label="备用模型名称" placeholder="手动输入或从列表选择" />} />
                              <Button variant="contained" startIcon={<SaveIcon />} onClick={saveFb}
                                disabled={fbLoading || !fbF.provider || !fbF.model || !fbHasKey}>保存备用 Provider</Button>
                              {fbMsg && <Alert severity={fbMsg.ok ? 'success' : 'error'} onClose={() => setFbMsg(null)}>{fbMsg.t}</Alert>}
                            </>
                          )}
                        </Stack>
                      </Box>
                    </>
                  ) : (
                    /* ═══ Local mode ═══ */
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 2 }}>
                        本地 Embedding 服务
                      </Typography>
                      <Stack spacing={2.5}>
                        <FormControl size="small"><InputLabel>本地服务</InputLabel>
                          <Select value={embF.provider} label="本地服务" onChange={e => { setEmbF(p => ({ ...p, provider: e.target.value, model: '' })); setEmbModels(null); }}>
                            {provLocal.map(pr => <MenuItem key={pr.id} value={pr.id}>{pr.name}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {provLocal.find(p => p.id === embF.provider)?.note && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                            {provLocal.find(p => p.id === embF.provider)!.note}
                          </Typography>
                        )}
                        <TextField size="small" label="本地服务地址" value={embF.local_url}
                          onChange={e => setEmbF(p => ({ ...p, local_url: e.target.value }))}
                          placeholder={emb.local_url ? emb.local_url + ' （填写以覆盖）' : 'http://localhost:11434/v1'}
                          helperText="需包含 /v1 后缀，如 http://localhost:11434/v1" />
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button variant="outlined" size="small" startIcon={embFetching ? <CircularProgress size={16} /> : <FetchIcon />}
                            onClick={fetchEmb} disabled={embFetching || !embF.provider || !embF.local_url}>
                            {embFetching ? '获取中...' : '获取可用模型'}
                          </Button>
                          <ModelBadge dm={embModels} />
                        </Stack>
                        <Autocomplete freeSolo options={opts(embModels, embF.provider, emb)}
                          value={embF.model} onChange={(_, v) => setEmbF(p => ({ ...p, model: v || '' }))}
                          onInputChange={(_, v) => setEmbF(p => ({ ...p, model: v }))}
                          renderInput={params => <TextField {...params} size="small" label="模型名称" placeholder="如 nomic-embed-text, bge-m3" />} />
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button variant="contained" startIcon={<SaveIcon />} onClick={saveEmb}
                            disabled={embLoading || !embF.provider || !embF.model || !embF.local_url}>保存本地配置</Button>
                          <IconButton size="small" onClick={loadEmb} sx={{ color: 'text.secondary' }}><RefreshIcon fontSize="small" /></IconButton>
                        </Stack>
                        {embMsg && <Alert severity={embMsg.ok ? 'success' : 'error'} onClose={() => setEmbMsg(null)}>{embMsg.t}</Alert>}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
