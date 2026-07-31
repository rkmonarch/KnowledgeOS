"use client";

import { AlertCircle, CheckCircle2, Database, FileText, RefreshCw, Search, Send, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createKnowledgeOSClient } from "@knowledgeos/sdk";
import type { ConceptRecord, RetrievalResult } from "@knowledgeos/shared/domain";

const apiUrl = "/api";

const sampleMarkdown = `# Authentication

The backend authentication service uses OAuth for user sign-in.
Access tokens expire after 30 minutes.

## Mobile SDK

The Mobile SDK uses the OAuth device flow for constrained devices.
`;

export default function DashboardPage() {
  const client = useMemo(() => createKnowledgeOSClient(apiUrl), []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("Architecture.md");
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [concepts, setConcepts] = useState<ConceptRecord[]>([]);
  const [query, setQuery] = useState("How does authentication work?");
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [connectionState, setConnectionState] = useState<"checking" | "online" | "offline">("checking");
  const [isBusy, setIsBusy] = useState(false);
  const markdownStats = useMemo(() => getTextStats(markdown), [markdown]);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize(): Promise<void> {
    try {
      const response = await client.getDefaultWorkspace();
      setWorkspaceId(response.workspace.id);
      setStatus(`Workspace: ${response.workspace.name}`);
      setConnectionState("online");
      await refreshConcepts(response.workspace.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API connection failed");
      setConnectionState("offline");
    }
  }

  async function refreshConcepts(id = workspaceId): Promise<void> {
    if (!id) {
      return;
    }
    const response = await client.listConcepts(id);
    setConcepts(response.concepts);
  }

  async function submitMarkdown(): Promise<void> {
    if (!workspaceId) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await client.ingestMarkdown({
        workspaceId,
        name: sourceName,
        content: markdown,
        metadata: {
          submittedFrom: "dashboard"
        }
      });
      setStatus(
        response.changed
          ? `Queued ${response.sectionCount} section${response.sectionCount === 1 ? "" : "s"}`
          : "No source changes detected"
      );
      await refreshConcepts(workspaceId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ingestion failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function runSearch(): Promise<void> {
    if (!workspaceId) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await client.search({
        workspaceId,
        query,
        limit: 8,
        filters: {}
      });
      setResults(response.results);
      setStatus(`${response.results.length} result${response.results.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brandMark">
            <Database size={18} />
            <span>KnowledgeOS</span>
          </div>
          <h1>Knowledge Console</h1>
        </div>
        <button className="iconButton dark" type="button" onClick={() => void refreshConcepts()} title="Refresh concepts">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="statusBand">
        <div className={`statusPill ${connectionState}`}>
          {connectionState === "online" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{connectionState === "online" ? "API Online" : connectionState === "checking" ? "Checking API" : "API Offline"}</span>
        </div>
        <div className="statusMessage">
          <span className={isBusy ? "pulse" : ""}>{status}</span>
          <code>Next.js route handlers</code>
        </div>
        <div className="metricStrip">
          <Metric label="Concepts" value={concepts.length.toString()} />
          <Metric label="Results" value={results.length.toString()} />
          <Metric label="Lines" value={markdownStats.lines.toString()} />
        </div>
      </section>

      <div className="workspaceGrid">
        <section className="surface ingestSurface">
          <div className="sectionHeader">
            <div className="sectionTitle">
              <UploadCloud size={19} />
              <h2>Markdown Source</h2>
            </div>
            <span className="sectionMeta">{markdownStats.characters} chars</span>
          </div>
          <div className="sourceControls">
            <label className="fieldGroup" htmlFor="sourceName">
              <span>Name</span>
              <input
                id="sourceName"
                className="textInput"
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
              />
            </label>
          </div>
          <textarea
            id="markdown"
            className="markdownInput"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
          <div className="actionRow">
            <button className="primaryButton" type="button" disabled={isBusy || !workspaceId} onClick={() => void submitMarkdown()}>
              <Send size={17} />
              Queue Ingestion
            </button>
            <span className="inlineState">{workspaceId ? "Ready" : "Waiting for API"}</span>
          </div>
        </section>

        <section className="surface conceptsSurface">
          <div className="sectionHeader">
            <div className="sectionTitle">
              <FileText size={19} />
              <h2>Concepts</h2>
            </div>
            <span className="sectionMeta">{concepts.length}</span>
          </div>
          <div className="conceptList">
            {concepts.length === 0 ? (
              <div className="emptyState">
                <FileText size={18} />
                <span>No concepts yet</span>
              </div>
            ) : (
              concepts.map((concept) => (
                <article className="conceptRow" key={concept.id}>
                  <div>
                    <div className="rowHeader">
                      <h3>{concept.title}</h3>
                      <span className="confidence">{Math.round(concept.confidence * 100)}%</span>
                    </div>
                    <p>{concept.summary}</p>
                    <div className="tagRow">
                      <span>{concept.type}</span>
                      {concept.tags.slice(0, 4).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="citation">
                    {concept.citations[0]
                      ? `${concept.citations[0].sourceName}:${concept.citations[0].startLine}-${concept.citations[0].endLine}`
                      : "No citation"}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="surface searchSurface">
          <div className="sectionHeader">
            <div className="sectionTitle">
              <Search size={19} />
              <h2>Search</h2>
            </div>
            <span className="sectionMeta">Semantic</span>
          </div>
          <div className="searchBar">
            <input
              className="textInput"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void runSearch();
                }
              }}
            />
            <button className="iconButton accent" type="button" disabled={isBusy || !workspaceId} onClick={() => void runSearch()} title="Search">
              <Search size={18} />
            </button>
          </div>
          <div className="resultList">
            {results.length === 0 ? (
              <div className="emptyState">
                <Search size={18} />
                <span>No search results</span>
              </div>
            ) : (
              results.map((result) => (
                <article className="resultRow" key={result.concept.id}>
                  <div className="score">{Math.round(result.score * 100)}%</div>
                  <div>
                    <h3>{result.concept.title}</h3>
                    <p>{result.concept.summary}</p>
                    <p className="reason">{result.explanation.reasons.join(" · ")}</p>
                    {result.citations[0] ? (
                      <p className="citation">
                        {result.citations[0].sourceName}:{result.citations[0].startLine}-{result.citations[0].endLine}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getTextStats(value: string): { characters: number; lines: number } {
  return {
    characters: value.length,
    lines: value.length === 0 ? 0 : value.split("\n").length
  };
}
