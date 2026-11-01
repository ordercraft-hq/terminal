# Security Policy

The OrderCraft community takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose any findings.

---

## 🔒 Supported Versions

Only the latest release of OrderCraft receives active security patches.

| Version | Supported |
|---|---|
| `v0.1.x` | :white_check_mark: |
| `< v0.1.0` | :x: |

---

## 🛡️ Architecture & Local Credential Security

OrderCraft is designed with a strict **Local-First, Zero-Telemetry Architecture**:
1. **Local Storage:** All user data, charts, drawing annotations, layout configurations, and broker API credentials are saved exclusively to the user's local machine inside the embedded SQLite database (`data/ordercraft.db`).
2. **Zero External Telemetry:** OrderCraft never transmits usage metrics, analytics, crash reports, or trading data to external central servers.
3. **Bring Your Own Key (BYOK):** When configuring broker integrations (e.g., Alpaca, OANDA), credentials are saved in local SQLite storage and used only by your local machine to establish direct TLS/WebSocket sessions with the broker. API secrets are never transmitted to any third party.

---

## 🚨 Reporting a Vulnerability

If you discover a potential security vulnerability in OrderCraft, please **do not** open a public issue or discuss it in public channels on GitHub.

Instead, please submit reports exclusively through GitHub's built-in **Private Security Advisories**:

👉 **[Submit a Private Security Advisory](https://github.com/ordercraft-hq/terminal/security/advisories/new)**

When submitting your private advisory, please ensure you include:
1. **Description & Impact:** A clear explanation of the vulnerability and its potential security impact.
2. **Reproduction Steps:** Step-by-step instructions or a minimal proof-of-concept (PoC) demonstrating the issue.
3. **Environment Details:** Affected version(s), operating system, browser, and relevant build flags or configuration settings.

Maintainers will acknowledge receipt of your report within 48 hours, collaborate privately on verification and patches, and coordinate a responsible disclosure timeline prior to public release.

