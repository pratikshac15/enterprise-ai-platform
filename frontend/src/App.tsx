
import { useState } from "react";
import keycloak from "./auth/keycloak";
import "./App.css";

function App() {
  const [authenticated, setAuthenticated] = useState(
    keycloak.authenticated ?? false
  );

  const login = async () => {
    await keycloak.login();
  };

  const logout = async () => {
    await keycloak.logout({
      redirectUri: window.location.origin,
    });
  };

  const roles = keycloak.realmAccess?.roles ?? [];

  return (
    <main className="portal">
      <h1>ResearchAI Platform</h1>
      <p>University AI Platform Administration Portal</p>

      {!authenticated ? (
        <button onClick={login}>
          Login with ResearchAI
        </button>
      ) : (
        <section>
          <h2>Welcome, {keycloak.tokenParsed?.preferred_username}</h2>
          <p>Authentication successful!</p>

          <h3>Assigned Roles</h3>
          <ul>
            {roles.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>

        <button
          onClick={async () => {
            try {
              await keycloak.updateToken(30);

              const response = await fetch(
                "http://127.0.0.1:8000/auth/me",
                {
                  headers: {
                    Authorization: `Bearer ${keycloak.token}`,
                  },
                }
              );

              const data = await response.json();

              console.log("API status:", response.status);
              console.log("API response:", data);

              alert(
                `API status: ${response.status}\n` +
                JSON.stringify(data, null, 2)
              );
            } catch (error) {
              console.error("API authentication test failed:", error);
              alert("API request failed. Check the browser console.");
            }
          }}
        >
          Test Secure API
        </button>


        <button
          onClick={async () => {
            const endpoints = [
              "/student/dashboard",
              "/faculty/dashboard",
              "/admin/dashboard",
            ];

            try {
              await keycloak.updateToken(30);

              const results = [];

              for (const endpoint of endpoints) {
                const response = await fetch(
                  `http://127.0.0.1:8000${endpoint}`,
                  {
                    headers: {
                      Authorization: `Bearer ${keycloak.token}`,
                    },
                  }
                );

                const data = await response.json();

                results.push({
                  endpoint,
                  status: response.status,
                  response: data,
                });
              }

              console.table(results);
              alert(JSON.stringify(results, null, 2));
            } catch (error) {
              console.error("RBAC test failed:", error);
              alert("RBAC test failed. Check the browser console.");
            }
          }}
        >
          Test Role Permissions
        </button>

        <button
          onClick={async () => {
            try {
              await keycloak.updateToken(30);

              const headers = {
                Authorization: `Bearer ${keycloak.token}`,
                "Content-Type": "application/json",
              };

              const tests = [
                {
                  name: "List Models",
                  endpoint: "/models",
                  method: "GET",
                  body: undefined,
                },
                {
                  name: "Chat",
                  endpoint: "/chat",
                  method: "POST",
                  body: JSON.stringify({
                    model: "gemma3:4b",
                    prompt: "Say hello in one sentence.",
                  }),
                },
                {
                  name: "Compare Models",
                  endpoint: "/compare",
                  method: "POST",
                  body: JSON.stringify({
                    models: ["qwen3:8b", "gemma3:4b"],
                    prompt: "Say hello.",
                  }),
                },
              ];

              const results = [];

              for (const test of tests) {
                const response = await fetch(
                  `http://127.0.0.1:8000${test.endpoint}`,
                  {
                    method: test.method,
                    headers,
                    body: test.body,
                  }
                );

                results.push({
                  test: test.name,
                  status: response.status,
                  response: await response.json(),
                });
              }

              console.table(results);
              alert(
                results
                  .map((result) => `${result.test}: HTTP ${result.status}`)
                  .join("\n")
              );
            } catch (error) {
              console.error("AI endpoint test failed:", error);
              alert("AI endpoint test failed. Check browser console.");
            }
          }}
        >
          Test AI Permissions
        </button>


          <button onClick={logout}>Logout</button>
        </section>
      )}
    </main>
  );
}

export default App;
