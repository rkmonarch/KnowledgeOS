"use client";

import { Activity, AlertCircle, CheckCircle2, Clock, Database, FileText, RefreshCw, Search, Send, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createKnowledgeOSClient } from "@knowledgeos/sdk";
import type { ConceptDetailResponse, ConceptRecord, JobRecord, RetrievalResult, SourceCitation } from "@knowledgeos/shared/domain";

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
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptDetailResponse | null>(null);
  const [isLoadingConcept, setIsLoadingConcept] = useState(false);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [query, setQuery] = useState("How does authentication work?");
  const [results, setResults] = useState<RetrievalResult[]>([]);
  const [status, setStatus] = useState("Connecting");
  const [connectionState, setConnectionState] = useState<"checking" | "online" | "offline">("checking");
  const [isBusy, setIsBusy] = useState(false);
  const markdownStats = useMemo(() => getTextStats(markdown), [markdown]);
  const jobStats = useMemo(() => summarizeJobs(jobs), [jobs]);
  const activeJobCount = jobStats.queued + jobStats.running;

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (concepts.length === 0) {
      setSelectedConceptId(null);
      setConceptDetail(null);
      return;
    }

    if (!selectedConceptId || !concepts.some((concept) => concept.id === selectedConceptId)) {
      setSelectedConceptId(concepts[0]?.id ?? null);
    }
  }, [concepts, selectedConceptId]);

  useEffect(() => {
    if (!workspaceId || !selectedConceptId) {
      return;
    }

    void loadConceptDetail(workspaceId, selectedConceptId);
  }, [workspaceId, selectedConceptId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshDashboard(workspaceId);
    }, 5_000);

    return () => window.clearInterval(intervalId);
  }, [workspaceId]);

  async function initialize(): Promise<void> {
    try {
      const response = await client.getDefaultWorkspace();
      setWorkspaceId(response.workspace.id);
      setStatus(`Workspace: ${response.workspace.name}`);
      setConnectionState("online");
      await refreshDashboard(response.workspace.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "API connection failed");
      setConnectionState("offline");
    }
  }

  async function refreshDashboard(id = workspaceId): Promise<void> {
    if (!id) {
      return;
    }

    await Promise.all([refreshConcepts(id), refreshJobs(id)]);
  }

  async function refreshConcepts(id = workspaceId): Promise<void> {
    if (!id) {
      return;
    }
    const response = await client.listConcepts(id);
    setConcepts(response.concepts);
  }

  async function refreshJobs(id = workspaceId): Promise<void> {
    if (!id) {
      return;
    }
    const response = await client.listJobs(id, 30);
    setJobs(response.jobs);
  }

  async function loadConceptDetail(id = workspaceId, conceptId = selectedConceptId): Promise<void> {
    if (!id || !conceptId) {
      return;
    }

    setIsLoadingConcept(true);
    setConceptDetail(null);
    try {
      const response = await client.getConceptDetail(id, conceptId);
      setConceptDetail(response);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Concept detail failed");
    } finally {
      setIsLoadingConcept(false);
    }
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
      await refreshDashboard(workspaceId);
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
        <button className="iconButton dark" type="button" onClick={() => void refreshDashboard()} title="Refresh dashboard">
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
          <Metric label="Jobs" value={activeJobCount.toString()} />
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
            <span className="inlineState">
              {workspaceId ? (activeJobCount > 0 ? `${activeJobCount} active` : "Ready") : "Waiting for API"}
            </span>
          </div>
          <JobMonitor jobs={jobs} stats={jobStats} />
        </section>

        <section className="surface conceptsSurface">
          <div className="sectionHeader">
            <div className="sectionTitle">
              <FileText size={19} />
              <h2>Concepts</h2>
            </div>
            <span className="sectionMeta">{concepts.length}</span>
          </div>
          {concepts.length > 0 ? <ConceptDetailPanel detail={conceptDetail} isLoading={isLoadingConcept} /> : null}
          <div className="conceptList">
            {concepts.length === 0 ? (
              <div className="emptyState">
                <FileText size={18} />
                <span>No concepts yet</span>
              </div>
            ) : (
              concepts.map((concept) => (
                <button
                  className={`conceptRow ${concept.id === selectedConceptId ? "selected" : ""}`}
                  key={concept.id}
                  type="button"
                  onClick={() => setSelectedConceptId(concept.id)}
                >
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
                </button>
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

function ConceptDetailPanel({
  detail,
  isLoading
}: Readonly<{ detail: ConceptDetailResponse | null; isLoading: boolean }>) {
  if (!detail) {
    return (
      <div className="conceptDetail">
        <div className="emptyState compact">
          <FileText size={17} />
          <span>{isLoading ? "Loading concept" : "Select a concept"}</span>
        </div>
      </div>
    );
  }

  return (
    <article className="conceptDetail">
      <div className="detailHeader">
        <div>
          <span className="eyebrow">Selected Concept</span>
          <h3>{detail.concept.title}</h3>
        </div>
        <span className="confidence">{Math.round(detail.concept.confidence * 100)}%</span>
      </div>
      <p className="detailBody">{detail.concept.body}</p>
      <div className="detailMetaRow">
        <span>{detail.concept.type}</span>
        <span>{detail.concept.status}</span>
        {detail.concept.citations[0] ? <span>{formatCitation(detail.concept.citations[0])}</span> : null}
      </div>
      <div className="claimSection">
        <div className="claimSectionHeader">
          <span>Claims</span>
          <strong>{detail.claims.length}</strong>
        </div>
        <div className="claimList">
          {detail.claims.length === 0 ? (
            <div className="emptyState compact">
              <FileText size={17} />
              <span>No claims extracted</span>
            </div>
          ) : (
            detail.claims.slice(0, 5).map((claim) => (
              <div className="claimRow" key={claim.id}>
                <div className="claimText">{claim.text}</div>
                <div className="claimFooter">
                  <span>{Math.round(claim.confidence * 100)}%</span>
                  {claim.citations[0] ? <span>{formatCitation(claim.citations[0])}</span> : null}
                </div>
                {claim.citations[0]?.quote ? <blockquote>{claim.citations[0].quote}</blockquote> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}

interface JobStats {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

function JobMonitor({ jobs, stats }: Readonly<{ jobs: JobRecord[]; stats: JobStats }>) {
  const progress = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
  const latestJobs = jobs.slice(0, 6);

  return (
    <div className="jobPanel">
      <div className="jobPanelHeader">
        <div>
          <span className="eyebrow">Pipeline</span>
          <h3>Pipeline Jobs</h3>
        </div>
        <span className="sectionMeta">{stats.total}</span>
      </div>
      <div className="jobSummary" aria-label="Job status summary">
        <span>
          <Clock size={14} />
          {stats.queued} queued
        </span>
        <span>
          <Activity size={14} />
          {stats.running} running
        </span>
        <span>
          <CheckCircle2 size={14} />
          {stats.completed} done
        </span>
        <span className={stats.failed > 0 ? "dangerText" : undefined}>
          <AlertCircle size={14} />
          {stats.failed} failed
        </span>
      </div>
      <div className="jobProgressTrack" aria-label={`${progress}% complete`}>
        <div className="jobProgressBar" style={{ width: `${progress}%` }} />
      </div>
      <div className="jobList">
        {latestJobs.length === 0 ? (
          <div className="emptyState compact">
            <FileText size={17} />
            <span>No jobs yet</span>
          </div>
        ) : (
          latestJobs.map((job) => (
            <div className="jobRow" key={job.id}>
              <div>
                <div className="jobTitle">{formatJobType(job.type)}</div>
                <div className="jobMeta">
                  {job.attempts}/{job.maxAttempts} attempts · {formatTime(job.updatedAt)}
                </div>
                {job.lastError ? <div className="jobError">{job.lastError}</div> : null}
              </div>
              <span className={`jobStatus ${job.status}`}>{job.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function summarizeJobs(jobs: JobRecord[]): JobStats {
  const stats: JobStats = { total: 0, queued: 0, running: 0, completed: 0, failed: 0 };

  for (const job of jobs) {
    stats.total += 1;
    stats[job.status] += 1;
  }

  return stats;
}

function formatJobType(type: JobRecord["type"]): string {
  switch (type) {
    case "extract_concepts_from_source_revision":
      return "Revision extraction";
    case "extract_concepts_from_source_section":
      return "Section extraction";
    case "embed_concept":
      return "Concept embedding";
    case "embed_claim":
      return "Claim embedding";
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCitation(citation: SourceCitation): string {
  return `${citation.sourceName}:${citation.startLine}-${citation.endLine}`;
}

function getTextStats(value: string): { characters: number; lines: number } {
  return {
    characters: value.length,
    lines: value.length === 0 ? 0 : value.split("\n").length
  };
}
