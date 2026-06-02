import os
import json
import streamlit as st
from openai import OpenAI

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

NIST_CONTROLS = [
    {
        "id": "ID.AM",
        "name": "Asset Inventory",
        "description": "Physical devices, software platforms, and systems within the organization are inventoried."
    },
    {
        "id": "ID.RA",
        "name": "Risk Assessment",
        "description": "Cybersecurity risks are identified, assessed, and documented to understand likelihood and impact."
    },
    {
        "id": "PR.AA",
        "name": "Identity & Access Management",
        "description": "Access to assets and associated facilities is limited to authorized users and processes."
    },
    {
        "id": "PR.AT",
        "name": "Security Awareness Training",
        "description": "Personnel and partners are provided cybersecurity awareness education and trained to perform duties."
    },
    {
        "id": "PR.DS",
        "name": "Data Protection",
        "description": "Information and records are managed in a manner consistent with risk strategy to protect confidentiality, integrity, and availability."
    },
    {
        "id": "DE.CM",
        "name": "Security Monitoring",
        "description": "The network and assets are monitored to identify cybersecurity events."
    },
    {
        "id": "DE.AE",
        "name": "Anomaly Detection",
        "description": "Anomalous activity is detected and the potential impact of events is understood."
    },
    {
        "id": "RS.RP",
        "name": "Incident Response Plan",
        "description": "Response processes and procedures are executed and maintained to ensure response to detected cybersecurity incidents."
    },
    {
        "id": "RC.RP",
        "name": "Recovery Planning",
        "description": "Recovery processes and procedures are executed and maintained to ensure restoration of systems or assets."
    },
    {
        "id": "RC.CO",
        "name": "Communication & Improvement",
        "description": "Restoration activities are coordinated with internal and external parties, and recovery planning is improved."
    },
]

STATUS_COLORS = {
    "Met": "🟢",
    "Partially Met": "🟡",
    "Not Found": "🔴",
}

STATUS_SCORES = {
    "Met": 1.0,
    "Partially Met": 0.5,
    "Not Found": 0.0,
}


def evaluate_policy(policy_text: str) -> list[dict]:
    controls_json = json.dumps(
        [{"id": c["id"], "name": c["name"], "description": c["description"]} for c in NIST_CONTROLS],
        indent=2
    )

    prompt = f"""You are a cybersecurity compliance expert specializing in NIST Cybersecurity Framework (CSF) 2.0.

Analyze the following policy document and evaluate it against each of the provided NIST CSF 2.0 subcategories.

For each control, respond with:
- "status": one of exactly "Met", "Partially Met", or "Not Found"
- "rationale": a single sentence explaining your assessment based on evidence (or lack thereof) in the document

NIST CSF 2.0 Controls to evaluate:
{controls_json}

Policy Document:
\"\"\"
{policy_text}
\"\"\"

Respond ONLY with a valid JSON array. Each element must have: "id", "status", and "rationale".
Example format:
[
  {{"id": "ID.AM", "status": "Met", "rationale": "The policy explicitly defines an asset inventory process covering hardware, software, and data assets."}},
  ...
]"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )

    raw = response.choices[0].message.content
    parsed = json.loads(raw)

    if isinstance(parsed, dict):
        for key in parsed:
            if isinstance(parsed[key], list):
                parsed = parsed[key]
                break

    results_by_id = {r["id"]: r for r in parsed}
    final = []
    for ctrl in NIST_CONTROLS:
        match = results_by_id.get(ctrl["id"], {})
        final.append({
            "id": ctrl["id"],
            "name": ctrl["name"],
            "description": ctrl["description"],
            "status": match.get("status", "Not Found"),
            "rationale": match.get("rationale", "No rationale provided."),
        })
    return final


def compute_score(results: list[dict]) -> float:
    total = sum(STATUS_SCORES.get(r["status"], 0) for r in results)
    return round((total / len(results)) * 100, 1)


def render_report(results: list[dict], score: float):
    st.markdown("---")
    st.subheader("📊 Executive Compliance Report")

    col1, col2, col3 = st.columns(3)
    met = sum(1 for r in results if r["status"] == "Met")
    partial = sum(1 for r in results if r["status"] == "Partially Met")
    not_found = sum(1 for r in results if r["status"] == "Not Found")

    col1.metric("Overall Score", f"{score}%")
    col2.metric("Controls Met", f"{met} / {len(results)}")
    col3.metric("Gaps Identified", str(not_found + partial))

    if score >= 80:
        level, color = "Strong", "success"
    elif score >= 50:
        level, color = "Moderate", "warning"
    else:
        level, color = "Weak", "error"

    getattr(st, color)(f"**Compliance Posture: {level}** — Overall score of {score}% against 10 NIST CSF 2.0 subcategories.")

    st.markdown("### Control Evaluation Results")
    for r in results:
        icon = STATUS_COLORS.get(r["status"], "⚪")
        with st.expander(f"{icon} **{r['id']} — {r['name']}**  `{r['status']}`"):
            st.markdown(f"**NIST Description:** {r['description']}")
            st.markdown(f"**Assessment:** {r['rationale']}")

    gaps = [r for r in results if r["status"] in ("Partially Met", "Not Found")]
    if gaps:
        st.markdown("### 🔧 Gap Recommendations")
        for g in gaps:
            icon = STATUS_COLORS.get(g["status"], "⚪")
            priority = "High Priority" if g["status"] == "Not Found" else "Medium Priority"
            st.markdown(
                f"- {icon} **{g['id']} — {g['name']}** _{priority}_: "
                f"Address gap — {g['rationale']}"
            )
    else:
        st.success("✅ No gaps found. All controls are fully met.")

    st.markdown("### 📋 Summary Table")
    table_data = {
        "Control ID": [r["id"] for r in results],
        "Control Name": [r["name"] for r in results],
        "Status": [f"{STATUS_COLORS.get(r['status'], '')} {r['status']}" for r in results],
        "Rationale": [r["rationale"] for r in results],
    }
    st.dataframe(table_data, use_container_width=True)


def render_download(results: list[dict], score: float):
    met = sum(1 for r in results if r["status"] == "Met")
    partial = sum(1 for r in results if r["status"] == "Partially Met")
    not_found = sum(1 for r in results if r["status"] == "Not Found")
    gaps = [r for r in results if r["status"] in ("Partially Met", "Not Found")]

    lines = [
        "AI COMPLIANCE READINESS COPILOT",
        "NIST CSF 2.0 Executive Compliance Report",
        "=" * 60,
        f"Overall Compliance Score: {score}%",
        f"Controls Met:             {met} / {len(results)}",
        f"Partially Met:            {partial}",
        f"Not Found:                {not_found}",
        "=" * 60,
        "",
        "CONTROL EVALUATION RESULTS",
        "-" * 60,
    ]

    for r in results:
        lines += [
            f"\n[{r['id']}] {r['name']}",
            f"  Status:    {r['status']}",
            f"  Rationale: {r['rationale']}",
        ]

    if gaps:
        lines += ["", "", "GAP RECOMMENDATIONS", "-" * 60]
        for g in gaps:
            priority = "HIGH" if g["status"] == "Not Found" else "MEDIUM"
            lines.append(f"[{priority}] {g['id']} — {g['name']}: {g['rationale']}")

    return "\n".join(lines)


def main():
    st.set_page_config(
        page_title="AI Compliance Readiness Copilot",
        page_icon="🛡️",
        layout="wide",
    )

    st.title("🛡️ AI Compliance Readiness Copilot")
    st.markdown(
        "Evaluate your policy document against **10 NIST CSF 2.0 subcategories** "
        "and generate an executive compliance report with gap recommendations."
    )

    with st.expander("ℹ️ About this tool"):
        st.markdown(
            """
This tool uses GPT-4o to analyze your policy document against the following NIST CSF 2.0 subcategories:

| Control ID | Control Name |
|---|---|
| ID.AM | Asset Inventory |
| ID.RA | Risk Assessment |
| PR.AA | Identity & Access Management |
| PR.AT | Security Awareness Training |
| PR.DS | Data Protection |
| DE.CM | Security Monitoring |
| DE.AE | Anomaly Detection |
| RS.RP | Incident Response Plan |
| RC.RP | Recovery Planning |
| RC.CO | Communication & Improvement |

Each control is scored as **Met**, **Partially Met**, or **Not Found** with a one-sentence rationale.
"""
        )

    st.markdown("### 📄 Paste Your Policy Document")
    policy_text = st.text_area(
        label="Policy Document",
        placeholder="Paste your information security policy, data protection policy, incident response plan, or any compliance document here...",
        height=300,
        label_visibility="collapsed",
    )

    col_btn, col_info = st.columns([1, 4])
    with col_btn:
        analyze = st.button("🔍 Analyze Policy", type="primary", use_container_width=True)
    with col_info:
        st.caption("Analysis typically takes 10–20 seconds. Your document is sent to OpenAI for evaluation.")

    if analyze:
        if not policy_text.strip():
            st.warning("Please paste a policy document before analyzing.")
            return

        if len(policy_text.strip()) < 50:
            st.warning("The document appears too short. Please provide a more complete policy.")
            return

        with st.spinner("Evaluating policy against NIST CSF 2.0 controls…"):
            try:
                results = evaluate_policy(policy_text)
                score = compute_score(results)
                st.session_state["results"] = results
                st.session_state["score"] = score
            except Exception as e:
                st.error(f"Evaluation failed: {e}")
                return

    if "results" in st.session_state:
        results = st.session_state["results"]
        score = st.session_state["score"]
        render_report(results, score)

        report_text = render_download(results, score)
        st.download_button(
            label="⬇️ Download Report (.txt)",
            data=report_text,
            file_name="nist_csf_compliance_report.txt",
            mime="text/plain",
        )


if __name__ == "__main__":
    main()
