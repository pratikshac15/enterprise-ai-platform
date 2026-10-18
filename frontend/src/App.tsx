import { useEffect, useState } from "react";
import keycloak from "./auth/keycloak";
import "./App.css";

type Page = "overview" | "chat" | "compare" | "admin";

type ComparisonResult = {
  model: string;
  response?: string;
  latency_seconds?: number;
  prompt_tokens?: number;
  generated_tokens?: number;
  tokens_per_second?: number;
  status: "success" | "error";
  error?: string;
};


type UsageAnalytics = {
  summary: {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    total_generated_tokens: number;
    average_latency_seconds: number | null;
  };
  model_usage: {
    model: string;
    request_count: number;
    generated_tokens: number;
  }[];
  recent_activity: {
    timestamp: string;
    username: string | null;
    action: string;
    model: string;
    status: string;
    latency_seconds: number | null;
  }[];
};


type SecurityEvent = {
  id: number;
  timestamp: string;
  username: string | null;
  action: string;
  resource: string;
  status: string;
  error_code: string | null;
};

type SecurityEventsResponse = {
  total: number;
  events: SecurityEvent[];
};


function App() {

  // Admin Analytics state
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [securityEvents, setSecurityEvents] =
    useState<SecurityEventsResponse | null>(null);

  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState("");

  const [activePage, setActivePage] = useState<Page>("overview");

  // AI Chat state
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  // Model Comparison state
  const [compareModels, setCompareModels] = useState<string[]>([
    "qwen3:8b",
    "gemma3:4b",
  ]);
  const [comparePrompt, setComparePrompt] = useState("");
  const [compareResults, setCompareResults] = useState<ComparisonResult[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState("");

  // Keycloak authentication and roles
  const authenticated = keycloak.authenticated ?? false;
  const username = keycloak.tokenParsed?.preferred_username ?? "User";
  const roles = keycloak.realmAccess?.roles ?? [];

  const isAdmin = roles.includes("platform-admin");
  const isFaculty = roles.includes("Faculty");
  const canCompare = isAdmin || isFaculty;

  const login = async () => {
    await keycloak.login();
  };

  const logout = async () => {
    await keycloak.logout({
      redirectUri: window.location.origin,
    });
  };

  // Load available models for both AI Chat and Model Comparison
  useEffect(() => {
    if (
      !authenticated ||
      (activePage !== "chat" && activePage !== "compare") ||
      (activePage === "compare" && !canCompare)
    ) {
      return;
    }

    let cancelled = false;

    const loadModels = async () => {
      try {
        await keycloak.updateToken(30);

        const response = await fetch("http://127.0.0.1:8000/models", {
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load models: HTTP ${response.status}`);
        }

        const data = await response.json();

        const names: string[] = (data.models ?? []).map(
          (model: string | { name: string }) =>
            typeof model === "string" ? model : model.name
        );

        if (cancelled) return;

        setModels(names);
        setSelectedModel((current) =>
          names.includes(current) ? current : names[0] ?? ""
        );

        setCompareModels((current) => {
          if (
            current.length === 2 &&
            current.every((model) => names.includes(model)) &&
            current[0] !== current[1]
          ) {
            return current;
          }

          return names.slice(0, 2);
        });

        setChatError("");
      } catch (error) {
        if (cancelled) return;

        console.error("Failed to load models:", error);
        setModels([]);
        setChatError("Unable to load AI models.");
        setCompareError("Unable to load AI models.");
      }
    };

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [authenticated, activePage, canCompare]);

  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);

  // Load admin analytics when an administrator opens the page
  useEffect(() => {
    if (!authenticated || !isAdmin || activePage !== "admin") {
      return;
    }

    let cancelled = false;

    const loadAnalytics = async () => {
      setAnalyticsLoading(true);
      setAnalyticsError("");

      try {
        await keycloak.updateToken(30);

        const response = await fetch(
          "http://127.0.0.1:8000/admin/analytics",
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load analytics: HTTP ${response.status}`
          );
        }

        const data: UsageAnalytics = await response.json();

        if (!cancelled) {
          setAnalytics(data);
          console.log("Admin analytics loaded:", data);
        }
      } catch (error) {
        if (!cancelled) {
          setAnalyticsError(
            error instanceof Error
              ? error.message
              : "Unable to load analytics."
          );
        }
      } finally {
        if (!cancelled) {
          setAnalyticsLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [authenticated, isAdmin, activePage, analyticsRefresh]);


  // Load security audit events for administrators
  useEffect(() => {
    if (!authenticated || !isAdmin || activePage !== "admin") {
      return;
    }

    let cancelled = false;

    const loadSecurityEvents = async () => {
      setSecurityLoading(true);
      setSecurityError("");

      try {
        await keycloak.updateToken(30);

        const response = await fetch(
          "http://127.0.0.1:8000/admin/security-events",
          {
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load security events: HTTP ${response.status}`
          );
        }

        const data: SecurityEventsResponse = await response.json();

        if (!cancelled) {
          setSecurityEvents(data);
          console.log("Security events loaded:", data);
        }
      } catch (error) {
        if (!cancelled) {
          setSecurityError(
            error instanceof Error
              ? error.message
              : "Unable to load security events."
          );
        }
      } finally {
        if (!cancelled) {
          setSecurityLoading(false);
        }
      }
    };

    void loadSecurityEvents();

    return () => {
      cancelled = true;
    };
  }, [authenticated, isAdmin, activePage, analyticsRefresh]);



  // Send prompt to selected AI model
  const sendPrompt = async () => {
    if (!prompt.trim() || !selectedModel || chatLoading) return;

    setChatLoading(true);
    setChatError("");
    setAiResponse("");

    try {
      await keycloak.updateToken(30);

      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Chat failed: HTTP ${response.status}`
        );
      }

      setAiResponse(
        data.response ?? data.answer ?? JSON.stringify(data)
      );
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "AI request failed."
      );
    } finally {
      setChatLoading(false);
    }
  };

  // Compare two Ollama models using the secured backend
  const runComparison = async () => {
    if (!canCompare || !comparePrompt.trim() || compareLoading) return;

    if (
      compareModels.length !== 2 ||
      !compareModels[0] ||
      !compareModels[1] ||
      compareModels[0] === compareModels[1]
    ) {
      setCompareError("Please select two different models.");
      return;
    }

    setCompareLoading(true);
    setCompareError("");
    setCompareResults([]);

    try {
      await keycloak.updateToken(30);

      const response = await fetch("http://127.0.0.1:8000/compare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          models: compareModels,
          prompt: comparePrompt.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Comparison failed: HTTP ${response.status}`
        );
      }

      setCompareResults(data.results ?? []);
    } catch (error) {
      setCompareError(
        error instanceof Error ? error.message : "Comparison failed."
      );
    } finally {
      setCompareLoading(false);
    }
  };

  // Login screen
  if (!authenticated) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>ResearchAI</h1>
          <p>University AI Platform</p>
          <button onClick={login}>Sign in with ResearchAI</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <h2>ResearchAI</h2>
          <p>AI Platform</p>
        </div>

        <nav className="navigation">
          <button
            className={activePage === "overview" ? "active" : ""}
            onClick={() => setActivePage("overview")}
          >
            Overview
          </button>

          <button
            className={activePage === "chat" ? "active" : ""}
            onClick={() => setActivePage("chat")}
          >
            AI Chat
          </button>

          {canCompare && (
            <button
              className={activePage === "compare" ? "active" : ""}
              onClick={() => setActivePage("compare")}
            >
              Model Comparison
            </button>
          )}

          {isAdmin && (
            <button
              className={activePage === "admin" ? "active" : ""}
              onClick={() => setActivePage("admin")}
            >
              Administration
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <p>{username}</p>
          <small>
            {isAdmin
              ? "Platform Admin"
              : isFaculty
                ? "Faculty"
                : "Student"}
          </small>
          <button onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>
              {activePage === "overview" && "Platform Overview"}
              {activePage === "chat" && "AI Chat"}
              {activePage === "compare" && "Model Comparison"}
              {activePage === "admin" && "Administration"}
            </h1>
            <p>Welcome back, {username}</p>
          </div>

          <span className="role-badge">
            {isAdmin ? "Admin" : isFaculty ? "Faculty" : "Student"}
          </span>
        </header>

        {/* Overview */}
        {activePage === "overview" && (
          <div className="overview-grid">
            <section className="dashboard-card">
              <h3>AI Chat</h3>
              <p>Interact with locally hosted AI models.</p>
              <button onClick={() => setActivePage("chat")}>
                Open AI Chat
              </button>
            </section>

            {canCompare && (
              <section className="dashboard-card">
                <h3>Model Comparison</h3>
                <p>Compare model responses and performance.</p>
                <button onClick={() => setActivePage("compare")}>
                  Compare Models
                </button>
              </section>
            )}

            {isAdmin && (
              <section className="dashboard-card">
                <h3>Administration</h3>
                <p>Platform access and governance tools.</p>
                <button onClick={() => setActivePage("admin")}>
                  Open Administration
                </button>
              </section>
            )}

            <section className="dashboard-card">
              <h3>Access Information</h3>
              <p>Authenticated through Keycloak OIDC.</p>
              <p>
                <strong>Assigned roles:</strong> {roles.join(", ")}
              </p>
            </section>
          </div>
        )}

        {/* AI Chat */}
        {activePage === "chat" && (
          <section className="dashboard-card chat-workspace">
            <h3>AI Chat Workspace</h3>
            <p>Interact securely with locally hosted Ollama models.</p>

            <label htmlFor="model-select">Select AI Model</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {models.length === 0 && (
                <option value="">No models available</option>
              )}

              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>

            <label htmlFor="ai-prompt">Your Prompt</label>
            <textarea
              id="ai-prompt"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask ResearchAI anything..."
            />

            <button
              onClick={sendPrompt}
              disabled={chatLoading || !selectedModel || !prompt.trim()}
            >
              {chatLoading ? "Generating..." : "Generate Response"}
            </button>

            {chatError && (
              <p className="chat-error" role="alert">
                {chatError}
              </p>
            )}

            {aiResponse && (
              <div className="chat-response">
                <h4>AI Response</h4>
                <p>{aiResponse}</p>
              </div>
            )}
          </section>
        )}

        {/* Model Comparison: Faculty and Admin only */}
        {activePage === "compare" && canCompare && (
          <section className="dashboard-card comparison-workspace">
            <h3>Model Comparison</h3>
            <p>
              Evaluate two locally hosted AI models using the same prompt.
            </p>

            <div className="comparison-selectors">
              {[0, 1].map((index) => (
                <div key={index}>
                  <label htmlFor={`compare-model-${index}`}>
                    Model {index + 1}
                  </label>

                  <select
                    id={`compare-model-${index}`}
                    value={compareModels[index] ?? ""}
                    onChange={(event) => {
                      setCompareModels((current) =>
                        current.map((model, i) =>
                          i === index ? event.target.value : model
                        )
                      );
                      setCompareResults([]);
                    }}
                  >
                    {models.length === 0 && (
                      <option value="">No models available</option>
                    )}

                    {models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <label htmlFor="compare-prompt">Comparison Prompt</label>
            <textarea
              id="compare-prompt"
              rows={4}
              value={comparePrompt}
              onChange={(event) => {
                setComparePrompt(event.target.value);
                setCompareResults([]);
              }}
              placeholder="Enter the same prompt for both models..."
            />

            <button
              onClick={runComparison}
              disabled={
                compareLoading ||
                models.length < 2 ||
                !comparePrompt.trim() ||
                compareModels.length !== 2 ||
                compareModels[0] === compareModels[1]
              }
            >
              {compareLoading
                ? "Comparing models..."
                : "Run Comparison"}
            </button>

            {compareError && (
              <p className="chat-error" role="alert">
                {compareError}
              </p>
            )}

            {compareResults.length > 0 && (
              <div className="comparison-results">
                {compareResults.map((result, index) => (
                  <article
                    className="model-result"
                    key={`${result.model}-${index}`}
                  >
                    <h3>{result.model}</h3>

                    {result.status === "error" ? (
                      <p className="chat-error" role="alert">
                        {result.error ?? "Model execution failed."}
                      </p>
                    ) : (
                      <>
                        <div className="model-metrics">
                          <p>
                            <strong>Latency:</strong>{" "}
                            {result.latency_seconds ?? "N/A"} s
                          </p>
                          <p>
                            <strong>Prompt tokens:</strong>{" "}
                            {result.prompt_tokens ?? "N/A"}
                          </p>
                          <p>
                            <strong>Generated tokens:</strong>{" "}
                            {result.generated_tokens ?? "N/A"}
                          </p>
                          <p>
                            <strong>Generation speed:</strong>{" "}
                            {result.tokens_per_second ?? "N/A"} tokens/s
                          </p>
                        </div>

                        <h4>Model Response</h4>
                        <div className="model-answer">
                          {result.response || "No response generated."}
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {/* Admin Analytics Dashboard */}
        {activePage === "admin" && isAdmin && (
          <div className="admin-dashboard">
            <h2>AI Platform Usage Analytics</h2>
            <p>Inference activity, model usage, and audit monitoring.</p>
            <button
              type="button"
              onClick={() => setAnalyticsRefresh((current) => current + 1)}
              disabled={analyticsLoading || securityLoading}
            >
              {analyticsLoading || securityLoading ? "Refreshing..." : "Refresh Analytics"}
            </button>

            {analyticsLoading && <p>Loading analytics...</p>}

            {analyticsError && (
              <p className="chat-error" role="alert">
                {analyticsError}
              </p>
            )}

            {!analyticsLoading && analytics && (
              <>
                <div className="analytics-grid">
                  <section className="dashboard-card">
                    <h3>Total Requests</h3>
                    <div className="analytics-value">
                      {analytics.summary.total_requests}
                    </div>
                  </section>

                  <section className="dashboard-card">
                    <h3>Successful Requests</h3>
                    <div className="analytics-value">
                      {analytics.summary.successful_requests}
                    </div>
                  </section>

                  <section className="dashboard-card">
                    <h3>Failed Requests</h3>
                    <div className="analytics-value">
                      {analytics.summary.failed_requests}
                    </div>
                  </section>

                  <section className="dashboard-card">
                    <h3>Generated Tokens</h3>
                    <div className="analytics-value">
                      {analytics.summary.total_generated_tokens.toLocaleString()}
                    </div>
                  </section>

                  <section className="dashboard-card">
                    <h3>Average Latency</h3>
                    <div className="analytics-value">
                      {analytics.summary.average_latency_seconds?.toFixed(2) ?? "N/A"}s
                    </div>
                  </section>
                </div>

                <section className="dashboard-card">
                  <h3>Model Usage</h3>

                  {analytics.model_usage.length === 0 ? (
                    <p>No model activity recorded yet.</p>
                  ) : (
                    <div className="analytics-table-wrapper">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>Requests</th>
                            <th>Generated Tokens</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.model_usage.map((model) => (
                            <tr key={model.model}>
                              <td>{model.model}</td>
                              <td>{model.request_count}</td>
                              <td>{model.generated_tokens}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="dashboard-card">
                  <h3>Recent Audit Activity</h3>

                  {analytics.recent_activity.length === 0 ? (
                    <p>No audit events recorded yet.</p>
                  ) : (
                    <div className="analytics-table-wrapper">
                      <table className="analytics-table">
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Action</th>
                            <th>Model</th>
                            <th>Status</th>
                            <th>Latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.recent_activity.map((event, index) => (
                            <tr key={index}>
                              <td>
                                {new Date(event.timestamp).toLocaleString()}
                              </td>
                              <td>{event.username ?? "Unknown"}</td>
                              <td>{event.action}</td>
                              <td>{event.model}</td>
                              <td>{event.status}</td>
                              <td>
                                {event.latency_seconds !== null
                                  ? `${event.latency_seconds.toFixed(2)}s`
                                  : "N/A"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>


              </>
            )}

                {/* Security Monitoring */}
                <section className="dashboard-card">
                  <h3>Security Monitoring</h3>
                  <p>Recent access-denied events across protected API endpoints.</p>

                  {securityLoading && <p>Loading security events...</p>}

                  {securityError && (
                    <p className="chat-error" role="alert">
                      {securityError}
                    </p>
                  )}

                  {!securityLoading && !securityError && securityEvents && (
                    <>
                      <p>
                        <strong>Total Security Events:</strong> {securityEvents.total}
                      </p>

                      {securityEvents.events.length === 0 ? (
                        <p>No security events recorded.</p>
                      ) : (
                        <div className="analytics-table-wrapper">
                          <table className="analytics-table">
                            <thead>
                              <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Resource</th>
                                <th>Status</th>
                                <th>Error Code</th>
                              </tr>
                            </thead>

                            <tbody>
                              {securityEvents.events.map((event) => (
                                <tr key={event.id}>
                                  <td>
                                    {new Date(event.timestamp).toLocaleString()}
                                  </td>
                                  <td>{event.username ?? "Unknown"}</td>
                                  <td>{event.action}</td>
                                  <td>{event.resource}</td>
                                  <td>{event.status}</td>
                                  <td>{event.error_code ?? "N/A"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </section>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
