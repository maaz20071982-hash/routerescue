import json
import logging
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests
import streamlit as st
import streamlit.components.v1 as components

# -----------------------------------------------------------------------------
# 1. Page Configuration & RouteRescue Emergency Theme
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="RouteRescue — Flood Intelligence & Road Routing",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Maximize screen area for the interactive application
st.markdown("""
<style>
    /* Hide default Streamlit chrome to provide seamless app experience */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    .block-container {
        padding: 0.25rem 0.5rem 0.5rem 0.5rem !important;
        margin: 0 !important;
        max-width: 100% !important;
    }
    
    /* Full-viewport iframe container */
    iframe {
        border: none !important;
        border-radius: 8px !important;
        width: 100% !important;
        height: 94vh !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }

    /* Streamlit sidebar styling */
    section[data-testid="stSidebar"] {
        background-color: #0b1325;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
    }
</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# 2. View Mode Selector
# -----------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### 🌊 RouteRescue Command")
    view_mode = st.radio(
        "Platform View",
        [
            "🖥️ Full RouteRescue Web App (Localhost Experience)",
            "📊 Backend Triage & Incident Intelligence"
        ],
        index=0
    )
    st.markdown("---")
    st.caption("● 24/7 Permanent Cloud Instance")
    st.caption("● OpenStreetMap Real Road Topologies")
    st.caption("● Zero API Keys Required")

# -----------------------------------------------------------------------------
# 3. Mode 1: Full RouteRescue Web App (100% Identical to Localhost)
# -----------------------------------------------------------------------------
if view_mode == "🖥️ Full RouteRescue Web App (Localhost Experience)":
    standalone_path = Path(__file__).resolve().parent / "static" / "standalone.html"
    
    if not standalone_path.exists():
        # Fallback to frontend/dist/standalone.html or build on the fly
        fallback_path = Path(__file__).resolve().parent / "frontend" / "dist" / "standalone.html"
        if fallback_path.exists():
            standalone_path = fallback_path
        else:
            try:
                import build_standalone
                build_standalone.build_standalone()
            except Exception as e:
                st.error(f"Error compiling standalone bundle: {e}")

    if standalone_path.exists():
        html_content = standalone_path.read_text(encoding="utf-8")
        components.html(html_content, height=920, scrolling=True)
    else:
        st.error("RouteRescue web bundle could not be found. Please contact administrator.")

# -----------------------------------------------------------------------------
# 4. Mode 2: Backend Triage & Incident Intelligence
# -----------------------------------------------------------------------------
else:
    st.title("RouteRescue — Backend Incident Intelligence & Triage")
    st.markdown("Direct Python interface to RouteRescue's incident repository, verification engine, and road network statistics.")

    # Initialize repository
    ROOT_DIR = Path(__file__).resolve().parent
    BACKEND_DIR = ROOT_DIR / "backend"
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    incidents = []
    try:
        from app.storage import DemoIncidentRepository
        repo = DemoIncidentRepository()
        incidents = repo.list_incidents()
    except Exception as e:
        st.warning(f"Using demo dataset (Backend module: {e})")
        incidents = [
            {
                "id": "DEMO-INC-101",
                "title": "Flooded Underpass & Road Blockage",
                "status": "OFFICIALLY_CONFIRMED",
                "water_depth_inches": 47.0,
                "latitude": 37.7749,
                "longitude": -122.4194,
                "location_name": "Market St & 10th Ave Underpass",
                "description": "Flash runoff collected in depressed underpass. Impassable for standard transit.",
                "affected_routes": ["Market St to Mission Corridor"]
            },
            {
                "id": "DEMO-INC-102",
                "title": "Moderate Water Accumulation at 4th & King",
                "status": "CORROBORATED",
                "water_depth_inches": 8.5,
                "latitude": 37.7765,
                "longitude": -122.3942,
                "location_name": "4th St & King St Transit Node",
                "description": "Corroborated ground reports of 8.5 inches water accumulation.",
                "affected_routes": ["4th St Transit Line"]
            }
        ]

    c1, c2, c3 = st.columns(3)
    c1.metric("Total Incidents", len(incidents))
    c2.metric("Confirmed Road Closures", sum(1 for i in incidents if "CONFIRMED" in i.get("status", "")))
    c3.metric("Corroborated Hazards", sum(1 for i in incidents if i.get("status") == "CORROBORATED"))

    st.subheader("Active Flood Observations")
    for inc in incidents:
        badge = "🔴 CONFIRMED" if "CONFIRMED" in inc.get("status", "") else ("🟠 CORROBORATED" if inc.get("status") == "CORROBORATED" else "🟡 UNVERIFIED")
        with st.expander(f"{badge} — {inc['title']} ({inc.get('location_name', 'Location')})"):
            st.write(f"**Description:** {inc.get('description', '')}")
            st.write(f"**Water Depth:** {inc.get('water_depth_inches', 0.0)} inches")
            st.write(f"**Coordinates:** `{inc.get('latitude', 0.0):.4f}, {inc.get('longitude', 0.0):.4f}`")
            st.write(f"**Affected Routes:** {', '.join(inc.get('affected_routes', []))}")
