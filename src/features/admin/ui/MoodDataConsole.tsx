import * as React from 'react';
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import {
  MOOD_AI_MODELS,
  type MoodAiConfig,
  type MoodAiModel,
  type MoodSearchResult,
} from '@bunizao/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function formatSnippet(value: string): string {
  return value.replace(/<\/?mark>/g, '');
}

function modelLabel(value: MoodAiModel): string {
  return value.replace(/^claude-/, '').replace(/-/g, ' ');
}

export default function MoodDataConsole() {
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [results, setResults] = React.useState<MoodSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [config, setConfig] = React.useState<MoodAiConfig | null>(null);
  const [configLoading, setConfigLoading] = React.useState(true);
  const [configSaving, setConfigSaving] = React.useState(false);
  const [configError, setConfigError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 240);
    return () => window.clearTimeout(id);
  }, [query]);

  const readError = React.useCallback(async (response: Response): Promise<string> => {
    const payload = await response.json().catch(() => ({}));
    return payload.error?.message || payload.message || payload.error || `HTTP ${response.status}`;
  }, []);

  const loadConfig = React.useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const response = await fetch('/v2/admin/mood/ai-config', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setConfig((await response.json()) as MoodAiConfig);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setConfigLoading(false);
    }
  }, [readError]);

  React.useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const saveConfig = React.useCallback(async (next: Pick<MoodAiConfig, 'primary' | 'fallback'>) => {
    if (!config) return;

    setConfigSaving(true);
    setConfigError(null);
    try {
      const response = await fetch('/v2/admin/mood/ai-config', {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setConfig((await response.json()) as MoodAiConfig);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'unknown_error');
    } finally {
      setConfigSaving(false);
    }
  }, [config, readError]);

  const search = React.useCallback(async (value: string) => {
    if (!value) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: value });
      const response = await fetch(`/v2/admin/mood/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message || payload.error || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as MoodSearchResult[];
      setResults(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown_error');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void search(debounced);
  }, [debounced, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4" />
            AI model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {configError}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mood-primary-model">Primary</Label>
              <Select
                value={config?.primary ?? 'claude-haiku-4-5'}
                disabled={!config || configLoading || configSaving}
                onValueChange={(value) => void saveConfig({
                  primary: value as MoodAiModel,
                  fallback: config?.fallback ?? 'claude-sonnet-4-6',
                })}
              >
                <SelectTrigger id="mood-primary-model">
                  <SelectValue placeholder={configLoading ? 'Loading...' : 'Select model'} />
                </SelectTrigger>
                <SelectContent>
                  {MOOD_AI_MODELS.map((model) => (
                    <SelectItem key={model} value={model}>{modelLabel(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mood-fallback-model">Fallback</Label>
              <Select
                value={config?.fallback ?? 'claude-sonnet-4-6'}
                disabled={!config || configLoading || configSaving}
                onValueChange={(value) => void saveConfig({
                  primary: config?.primary ?? 'claude-haiku-4-5',
                  fallback: value as MoodAiModel,
                })}
              >
                <SelectTrigger id="mood-fallback-model">
                  <SelectValue placeholder={configLoading ? 'Loading...' : 'Select model'} />
                </SelectTrigger>
                <SelectContent>
                  {MOOD_AI_MODELS.map((model) => (
                    <SelectItem key={model} value={model}>{modelLabel(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{config?.updatedAt ? `Updated ${formatDate(config.updatedAt)}` : 'Model config controls subsequent classifications.'}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadConfig()} disabled={configLoading || configSaving}>
              {configLoading ? <RefreshCw className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            Archive search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search mood text"
              aria-label="Search mood archive"
            />
            <Button type="button" variant="outline" onClick={() => void search(query.trim())} disabled={loading}>
              {loading ? <RefreshCw className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!debounced ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
              Type to search the archive.
            </div>
          ) : loading ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
              No matching moods.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {results.map((result) => (
                <li key={result.id} className="grid gap-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a className="font-medium hover:underline" href={`/mood/${encodeURIComponent(result.id)}`}>
                      Mood {result.id}
                    </a>
                    <span className="text-xs text-muted-foreground">{formatDate(result.datetime)}</span>
                  </div>
                  <p className="m-0 text-sm text-muted-foreground">{formatSnippet(result.snippet)}</p>
                  <div className="flex flex-wrap gap-2">
                    {result.tags.map((tag) => (
                      <Badge key={tag} variant="outline">#{tag}</Badge>
                    ))}
                    {result.sentiment_label ? <Badge variant="secondary">{result.sentiment_label}</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
