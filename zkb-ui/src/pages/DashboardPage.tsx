import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Skeleton,
  Chip,
  alpha,
} from '@mui/material';
import {
  Storage as StorageIcon,
  CheckCircle as HealthyIcon,
  Category as DomainIcon,
  Language as LangIcon,
  Memory as CacheIcon,
  Error as ErrorIcon,
  Cloud as CloudIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { getStats, getGraph, getCache } from '../api/knowledge';
import type { StatsResponse, GraphResponse, CacheResponse } from '../api/knowledge';

const CHART_COLORS = [
  '#7C4DFF', '#00E5FF', '#69F0AE', '#FFD740',
  '#FF5252', '#40C4FF', '#B388FF', '#FF6E40',
  '#EA80FC', '#82B1FF', '#CCFF90', '#FF8A80',
];

interface DistributionItem {
  name: string;
  value: number;
}

function DistributionChart({ title, data }: { title: string; data: DistributionItem[] }) {
  if (!data.length) return null;
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 2 }}>
          {title}
        </Typography>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
              animationBegin={200}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: '#1A1A3A',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {data.slice(0, 6).map((d, i) => (
            <Chip
              key={d.name}
              label={`${d.name}: ${d.value}`}
              size="small"
              sx={{
                backgroundColor: alpha(CHART_COLORS[i % CHART_COLORS.length], 0.15),
                color: CHART_COLORS[i % CHART_COLORS.length],
                fontSize: 11,
              }}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function toDistribution(record: Record<string, number>): DistributionItem[] {
  return Object.entries(record)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [cache, setCache] = useState<CacheResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, g, c] = await Promise.all([getStats(), getGraph(), getCache()]);
        if (!cancelled) {
          setStats(s.data);
          setGraph(g.data);
          setCache(c.data);
        }
      } catch {
        if (!cancelled) setError('无法连接到后端服务');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 12 }}>
        <Typography variant="h5" sx={{ color: 'error.main', mb: 1 }}>
          {error}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          请确认后端服务 172.29.84.122:8080 已启动
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>
        知识库 Dashboard
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        全局知识库运行状态与数据概览
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          {
            label: 'Python 服务状态',
            value: stats?.python_service?.status === 'healthy' ? '健康' : '异常',
            icon: <HealthyIcon />,
            color: stats?.python_service?.status === 'healthy' ? 'success' : 'error',
          },
          {
            label: 'Qdrant 集合',
            value: stats?.qdrant?.collection?.exists ? '就绪' : '未就绪',
            icon: <StorageIcon />,
            color: stats?.qdrant?.collection?.exists ? 'success' : 'error',
          },
          {
            label: '向量总数',
            value: stats?.qdrant?.collection?.points_count?.toLocaleString() ?? '-',
            icon: <StorageIcon />,
            color: 'primary',
          },
          {
            label: '知识领域',
            value: graph ? Object.keys(graph.aggregation.domain).length : '-',
            icon: <DomainIcon />,
            color: 'secondary',
          },
          {
            label: 'Cache 命中率',
            value: cache ? (cache.hits + cache.misses > 0 ? `${Math.round(cache.hits / (cache.hits + cache.misses) * 100)}%` : 'N/A') : '-',
            icon: <CacheIcon />,
            color: cache && cache.hits > cache.misses ? 'success' : 'info',
          },
          (() => {
            const embedOk = cache && cache.size > 0;
            const embedFail = cache && cache.size === 0 && cache.misses > 0;
            return {
              label: 'Embedding 状态',
              value: embedOk ? '正常' : embedFail ? '异常' : '待测',
              icon: embedFail ? <ErrorIcon /> : <CloudIcon />,
              color: embedOk ? 'success' : embedFail ? 'error' : undefined,
              hint: embedFail ? '额度不足或 Key 无效' : embedOk ? '缓存工作中' : '尚无请求',
            };
          })(),
        ].map((card) => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={card.label}>
            <Card
              sx={{
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 12px 40px ${alpha('#7C4DFF', 0.2)}`,
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `linear-gradient(135deg, ${alpha('#7C4DFF', 0.2)}, ${alpha('#00E5FF', 0.1)})`,
                    }}
                  >
                    <Box sx={{ color: `${card.color}.main` }}>{card.icon}</Box>
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {card.label}
                  </Typography>
                </Box>
                {loading ? (
                  <Skeleton variant="text" width={80} height={40} />
                ) : (
                  <>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {card.value}
                    </Typography>
                    {(card as any).hint && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                        {(card as any).hint}
                      </Typography>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Distribution Charts */}
      <Typography variant="h5" sx={{ mb: 3 }}>
        知识分布
      </Typography>
      <Grid container spacing={3}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                <Card>
                  <CardContent>
                    <Skeleton variant="circular" width={170} height={170} sx={{ mx: 'auto' }} />
                  </CardContent>
                </Card>
              </Grid>
            ))
          : graph && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <DistributionChart title="按领域 (Domain)" data={toDistribution(graph.aggregation.domain)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <DistributionChart title="按语言 (Language)" data={toDistribution(graph.aggregation.language)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <DistributionChart title="按框架 (Framework)" data={toDistribution(graph.aggregation.framework)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <DistributionChart title="按类型 (Type)" data={toDistribution(graph.aggregation.type)} />
                </Grid>
              </>
            )}
      </Grid>

      {/* Bar Chart Summary */}
      {graph && (
        <Card sx={{ mt: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 3 }}>
              语言分布总览 (Language Distribution)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={toDistribution(graph.aggregation.language)}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="#A0A0B8" fontSize={12} />
                <YAxis stroke="#A0A0B8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: '#1A1A3A',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    fontSize: 13,
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[8, 8, 0, 0]}
                  animationBegin={400}
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {toDistribution(graph.aggregation.language).map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
