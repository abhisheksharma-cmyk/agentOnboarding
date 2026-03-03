param(
  [string]$OutFile = 'AGENTIC_ONBOARDING_VISUAL_BRIEF.docx'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tmpRoot = Join-Path $env:TEMP ("docx_visual_" + [guid]::NewGuid().ToString())
$repoRoot = Get-Location
$diagramDir = Join-Path $repoRoot 'documents\diagrams'

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Get-EdgeExecutablePath {
  $candidates = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  throw 'Microsoft Edge executable was not found. Cannot render SVG diagrams to PNG.'
}

function Convert-SvgToPng {
  param(
    [string]$SvgPath,
    [string]$PngPath,
    [int]$Width,
    [int]$Height,
    [string]$EdgePath
  )

  $uri = [System.Uri]::new($SvgPath).AbsoluteUri
  & $EdgePath '--headless=new' '--disable-gpu' '--hide-scrollbars' "--screenshot=$PngPath" "--window-size=$Width,$Height" $uri | Out-Null

  if (-not (Test-Path $PngPath)) {
    throw "Failed to render PNG from SVG: $SvgPath"
  }
}

function Escape-Xml {
  param([string]$Text)
  return [System.Security.SecurityElement]::Escape($Text)
}

function New-TextParagraph {
  param(
    [string]$Text,
    [bool]$Bold = $false,
    [bool]$Code = $false
  )

  $escaped = Escape-Xml $Text

  if ($Code) {
    return ('<w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
  }

  if ($Bold) {
    return ('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
  }

  return ('<w:p><w:r><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
}

function New-ImageParagraph {
  param(
    [string]$RelId,
    [int]$DocPrId,
    [string]$Name,
    [int]$Cx,
    [int]$Cy
  )

  return @"
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="$Cx" cy="$Cy"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="$DocPrId" name="$Name"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="$DocPrId" name="$Name"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="$RelId"/>
                <a:stretch>
                  <a:fillRect/>
                </a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="$Cx" cy="$Cy"/>
                </a:xfrm>
                <a:prstGeom prst="rect">
                  <a:avLst/>
                </a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
"@
}

[System.IO.Directory]::CreateDirectory($diagramDir) | Out-Null
[System.IO.Directory]::CreateDirectory($tmpRoot) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot '_rels')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'docProps')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'word')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'word\_rels')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'word\media')) | Out-Null

$svg1 = @'
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 1600 1040">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f5fbff"/>
      <stop offset="100%" stop-color="#eef4ff"/>
    </linearGradient>
    <linearGradient id="boxBlue" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="boxTeal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
    <linearGradient id="boxSlate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-opacity="0.16"/>
    </filter>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#334155"/>
    </marker>
  </defs>

  <rect width="1600" height="1040" fill="url(#bg)"/>
  <text x="60" y="58" font-size="34" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Agentic Onboarding - Platform Topology</text>
  <text x="60" y="92" font-size="18" font-family="Segoe UI, Arial" fill="#334155">Distributed decision mesh with centralized policy authority</text>

  <rect x="70" y="150" rx="16" ry="16" width="290" height="120" fill="url(#boxBlue)" filter="url(#shadow)"/>
  <text x="95" y="198" font-size="22" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Client Experience</text>
  <text x="95" y="228" font-size="16" font-family="Segoe UI, Arial" fill="#dbeafe">Chat UX + Document Uploads</text>

  <rect x="430" y="150" rx="16" ry="16" width="320" height="120" fill="url(#boxBlue)" filter="url(#shadow)"/>
  <text x="458" y="198" font-size="22" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Express API Layer</text>
  <text x="458" y="228" font-size="16" font-family="Segoe UI, Arial" fill="#dbeafe">/onboarding/*  /chat/*  /trace/*</text>

  <rect x="820" y="130" rx="16" ry="16" width="360" height="150" fill="url(#boxSlate)" filter="url(#shadow)"/>
  <text x="848" y="182" font-size="24" font-family="Segoe UI, Arial" fill="#fff" font-weight="700">Orchestration Core</text>
  <text x="848" y="214" font-size="16" font-family="Segoe UI, Arial" fill="#e2e8f0">Event Bus + State Machine + Retry Layer</text>
  <text x="848" y="238" font-size="16" font-family="Segoe UI, Arial" fill="#e2e8f0">Trace-Aware Execution Control</text>

  <rect x="1270" y="150" rx="16" ry="16" width="250" height="120" fill="url(#boxTeal)" filter="url(#shadow)"/>
  <text x="1296" y="198" font-size="22" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Decision Gateway</text>
  <text x="1296" y="228" font-size="16" font-family="Segoe UI, Arial" fill="#ccfbf1">Final Policy Authority</text>

  <line x1="360" y1="210" x2="430" y2="210" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"/>
  <line x1="750" y1="210" x2="820" y2="210" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"/>
  <line x1="1180" y1="210" x2="1270" y2="210" stroke="#334155" stroke-width="3" marker-end="url(#arrow)"/>

  <rect x="110" y="380" rx="14" ry="14" width="220" height="90" fill="#1e293b" filter="url(#shadow)"/>
  <rect x="370" y="380" rx="14" ry="14" width="220" height="90" fill="#1e293b" filter="url(#shadow)"/>
  <rect x="630" y="380" rx="14" ry="14" width="220" height="90" fill="#1e293b" filter="url(#shadow)"/>
  <rect x="890" y="380" rx="14" ry="14" width="220" height="90" fill="#1e293b" filter="url(#shadow)"/>
  <rect x="1150" y="380" rx="14" ry="14" width="220" height="90" fill="#1e293b" filter="url(#shadow)"/>

  <text x="178" y="430" font-size="21" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">KYC Slot</text>
  <text x="424" y="430" font-size="21" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Address Slot</text>
  <text x="704" y="430" font-size="21" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">AML Slot</text>
  <text x="964" y="430" font-size="21" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Credit Slot</text>
  <text x="1232" y="430" font-size="21" font-family="Segoe UI, Arial" fill="#fff" font-weight="600">Risk Slot</text>

  <line x1="1000" y1="280" x2="220" y2="380" stroke="#475569" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="1000" y1="280" x2="480" y2="380" stroke="#475569" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="1000" y1="280" x2="740" y2="380" stroke="#475569" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="1000" y1="280" x2="1000" y2="380" stroke="#475569" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="1000" y1="280" x2="1260" y2="380" stroke="#475569" stroke-width="2.5" marker-end="url(#arrow)"/>

  <polyline points="220,470 220,515 1295,515 1295,285" stroke="#0f766e" stroke-width="2.4" fill="none" marker-end="url(#arrow)"/>
  <polyline points="480,470 480,530 1310,530 1310,285" stroke="#0f766e" stroke-width="2.4" fill="none" marker-end="url(#arrow)"/>
  <polyline points="740,470 740,545 1325,545 1325,285" stroke="#0f766e" stroke-width="2.4" fill="none" marker-end="url(#arrow)"/>
  <polyline points="1000,470 1000,560 1340,560 1340,285" stroke="#0f766e" stroke-width="2.4" fill="none" marker-end="url(#arrow)"/>
  <polyline points="1260,470 1260,575 1355,575 1355,285" stroke="#0f766e" stroke-width="2.4" fill="none" marker-end="url(#arrow)"/>

  <rect x="70" y="560" rx="16" ry="16" width="1460" height="330" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="100" y="610" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Control Attributes and Assurance Signals</text>
  <text x="100" y="655" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Slot-level versioning and endpoint routing via YAML</text>
  <text x="100" y="690" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Decision centralization: confidence thresholds, contradiction flags, provider risk flags</text>
  <text x="100" y="725" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Trace correlation: state transitions, step-level timing, and final decision provenance</text>
  <text x="100" y="760" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Resilience envelope: bounded retries, timeout governance, and deterministic fallback semantics</text>
  <text x="100" y="795" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Explainability fabric: reasons, policy references, flags, and metadata in every stage output</text>
</svg>
'@

$svg2 = @'
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="920" viewBox="0 0 1600 920">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#ecfeff"/>
    </linearGradient>
    <marker id="arr2" markerWidth="11" markerHeight="11" refX="9" refY="5.5" orient="auto">
      <path d="M0,0 L11,5.5 L0,11 z" fill="#0f172a"/>
    </marker>
  </defs>
  <rect width="1600" height="920" fill="url(#bg2)"/>
  <text x="60" y="58" font-size="34" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Orchestration Sequence and Decision Progression</text>
  <text x="60" y="92" font-size="18" font-family="Segoe UI, Arial" fill="#334155">Event-native lifecycle with policy checkpoints and fail-safe transitions</text>

  <line x1="120" y1="260" x2="1480" y2="260" stroke="#334155" stroke-width="4" marker-end="url(#arr2)"/>

  <circle cx="140" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="340" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="540" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="740" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="940" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="1140" cy="260" r="28" fill="#1d4ed8"/>
  <circle cx="1340" cy="260" r="28" fill="#0f766e"/>

  <text x="110" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">START</text>
  <text x="307" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">KYC</text>
  <text x="485" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">ADDRESS</text>
  <text x="706" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">AML</text>
  <text x="901" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">CREDIT</text>
  <text x="1108" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">RISK</text>
  <text x="1298" y="320" font-size="18" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="600">COMPLETE</text>

  <rect x="90" y="390" width="460" height="360" rx="16" ry="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="120" y="440" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Execution Semantics</text>
  <text x="120" y="482" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Transition events are deterministic and validated</text>
  <text x="120" y="516" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Retry strategy applies exponential backoff</text>
  <text x="120" y="550" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Decision Gateway evaluates every stage output</text>
  <text x="120" y="584" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Escalate/Deny can terminate downstream stages</text>
  <text x="120" y="618" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Audit events are persisted per trace ID</text>

  <rect x="590" y="390" width="470" height="360" rx="16" ry="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="620" y="440" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Policy Guardrails</text>
  <text x="620" y="482" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Minimum confidence threshold enforcement</text>
  <text x="620" y="516" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Missing-data and contradiction detection</text>
  <text x="620" y="550" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Provider high-risk signal suppression</text>
  <text x="620" y="584" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Final outputs: APPROVE | ESCALATE | DENY</text>
  <text x="620" y="618" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Explainability payload attached to every decision</text>

  <rect x="1100" y="390" width="430" height="360" rx="16" ry="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="1130" y="440" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Observability Layer</text>
  <text x="1130" y="482" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Traceable stage timings</text>
  <text x="1130" y="516" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Transition-by-transition history</text>
  <text x="1130" y="550" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Unified finished-state publication</text>
  <text x="1130" y="584" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Fast retrieval through /onboarding/trace/:traceId</text>
  <text x="1130" y="618" font-size="18" font-family="Segoe UI, Arial" fill="#334155">- Diagnostics-ready audit envelope</text>
</svg>
'@

$svg3 = @'
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1040" viewBox="0 0 1600 1040">
  <defs>
    <linearGradient id="bg3" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#eef2ff"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <marker id="arr3" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#334155"/>
    </marker>
  </defs>
  <rect width="1600" height="1040" fill="url(#bg3)"/>
  <text x="60" y="58" font-size="34" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">YAML Pluggability and Configuration Control Surface</text>
  <text x="60" y="92" font-size="18" font-family="Segoe UI, Arial" fill="#334155">Versioned slot-routing enables operational agility without code-level orchestration rewrites</text>

  <rect x="70" y="140" width="710" height="760" rx="16" ry="16" fill="url(#panel)"/>
  <text x="104" y="188" font-size="26" font-family="Consolas, monospace" fill="#93c5fd" font-weight="700">config/agents.yaml</text>
  <text x="104" y="236" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">agents:</text>
  <text x="104" y="268" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">  KYC:</text>
  <text x="104" y="300" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">    active: kyc_agent_v1</text>
  <text x="104" y="332" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">    versions:</text>
  <text x="104" y="364" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">      kyc_agent_v1:</text>
  <text x="104" y="396" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">        type: http</text>
  <text x="104" y="428" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">        endpoint: http://localhost:5005/agents/kyc2/decide</text>
  <text x="104" y="460" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">        timeout_ms: 1500</text>
  <text x="104" y="492" font-size="19" font-family="Consolas, monospace" fill="#e2e8f0">        enabled: true</text>
  <text x="104" y="548" font-size="19" font-family="Consolas, monospace" fill="#cbd5e1">  AML, CREDIT, ADDRESS_VERIFICATION, RISK...</text>
  <text x="104" y="580" font-size="19" font-family="Consolas, monospace" fill="#cbd5e1">  each with independent active version pointers</text>
  <text x="104" y="612" font-size="19" font-family="Consolas, monospace" fill="#cbd5e1">  and slot-specific operational controls.</text>

  <rect x="860" y="170" width="670" height="160" rx="14" ry="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="890" y="220" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Active Version Governance</text>
  <text x="890" y="254" font-size="16" font-family="Segoe UI, Arial" fill="#334155">The active key defines production routing instantly,</text>
  <text x="890" y="279" font-size="16" font-family="Segoe UI, Arial" fill="#334155">enabling release control from configuration.</text>
  <line x1="780" y1="260" x2="860" y2="250" stroke="#334155" stroke-width="2.5" marker-end="url(#arr3)"/>

  <rect x="860" y="360" width="670" height="160" rx="14" ry="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="890" y="410" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Multi-Version Strategy</text>
  <text x="890" y="444" font-size="16" font-family="Segoe UI, Arial" fill="#334155">The versions map supports blue-green promotion,</text>
  <text x="890" y="469" font-size="16" font-family="Segoe UI, Arial" fill="#334155">rollback, and controlled provider substitution.</text>
  <line x1="780" y1="430" x2="860" y2="440" stroke="#334155" stroke-width="2.5" marker-end="url(#arr3)"/>

  <rect x="860" y="550" width="670" height="160" rx="14" ry="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="890" y="600" font-size="24" font-family="Segoe UI, Arial" fill="#0f172a" font-weight="700">Safety and Runtime Controls</text>
  <text x="890" y="634" font-size="16" font-family="Segoe UI, Arial" fill="#334155">timeout_ms and enabled form a practical kill-switch</text>
  <text x="890" y="659" font-size="16" font-family="Segoe UI, Arial" fill="#334155">and latency-governance surface.</text>
  <line x1="780" y1="600" x2="860" y2="630" stroke="#334155" stroke-width="2.5" marker-end="url(#arr3)"/>

  <rect x="860" y="740" width="670" height="160" rx="14" ry="14" fill="#0f766e"/>
  <text x="890" y="790" font-size="24" font-family="Segoe UI, Arial" fill="#ffffff" font-weight="700">Outcome</text>
  <text x="890" y="824" font-size="16" font-family="Segoe UI, Arial" fill="#d1fae5">Pluggable, configurable, and operationally resilient</text>
  <text x="890" y="849" font-size="16" font-family="Segoe UI, Arial" fill="#d1fae5">onboarding intelligence mesh.</text>
</svg>
'@

$diag1Path = Join-Path $diagramDir 'architecture-topology.svg'
$diag2Path = Join-Path $diagramDir 'orchestration-sequence.svg'
$diag3Path = Join-Path $diagramDir 'yaml-pluggability-control-surface.svg'

Write-Utf8File -Path $diag1Path -Content $svg1
Write-Utf8File -Path $diag2Path -Content $svg2
Write-Utf8File -Path $diag3Path -Content $svg3

$png1Path = Join-Path $diagramDir 'architecture-topology.png'
$png2Path = Join-Path $diagramDir 'orchestration-sequence.png'
$png3Path = Join-Path $diagramDir 'yaml-pluggability-control-surface.png'

$edgePath = Get-EdgeExecutablePath
Convert-SvgToPng -SvgPath $diag1Path -PngPath $png1Path -Width 1600 -Height 1040 -EdgePath $edgePath
Convert-SvgToPng -SvgPath $diag2Path -PngPath $png2Path -Width 1600 -Height 920 -EdgePath $edgePath
Convert-SvgToPng -SvgPath $diag3Path -PngPath $png3Path -Width 1600 -Height 1040 -EdgePath $edgePath

$media1 = Join-Path $tmpRoot 'word\media\diagram1.png'
$media2 = Join-Path $tmpRoot 'word\media\diagram2.png'
$media3 = Join-Path $tmpRoot 'word\media\diagram3.png'

[System.IO.File]::Copy($png1Path, $media1, $true)
[System.IO.File]::Copy($png2Path, $media2, $true)
[System.IO.File]::Copy($png3Path, $media3, $true)

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@
Write-Utf8File -Path (Join-Path $tmpRoot '[Content_Types].xml') -Content $contentTypes

$rootRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@
Write-Utf8File -Path (Join-Path $tmpRoot '_rels\.rels') -Content $rootRels

$docRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram1.png"/>
  <Relationship Id="rIdImg2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram2.png"/>
  <Relationship Id="rIdImg3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram3.png"/>
</Relationships>
'@
Write-Utf8File -Path (Join-Path $tmpRoot 'word\_rels\document.xml.rels') -Content $docRels

$created = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$core = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Agentic Onboarding - Visual Technical Brief</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$created</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$created</dcterms:modified>
</cp:coreProperties>
"@
Write-Utf8File -Path (Join-Path $tmpRoot 'docProps\core.xml') -Content $core

$app = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
</Properties>
'@
Write-Utf8File -Path (Join-Path $tmpRoot 'docProps\app.xml') -Content $app

$parts = New-Object System.Collections.Generic.List[string]
$maxImageCx = 6200000
$image1Cy = [int]($maxImageCx * 1040 / 1600)
$image2Cy = [int]($maxImageCx * 920 / 1600)
$image3Cy = [int]($maxImageCx * 1040 / 1600)
$parts.Add((New-TextParagraph -Text 'AGENTIC ONBOARDING PLATFORM' -Bold $true))
$parts.Add((New-TextParagraph -Text 'Visual Architecture and Strategic Positioning Dossier' -Bold $true))
$parts.Add((New-TextParagraph -Text 'Purpose: Sophisticated technical narrative for product marketing, solution engineering, and stakeholder alignment.'))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '1) Strategic Narrative' -Bold $true))
$parts.Add((New-TextParagraph -Text 'Agentic Onboarding is an event-native underwriting intelligence platform that orchestrates specialized decision agents under a unified governance envelope.'))
$parts.Add((New-TextParagraph -Text 'Its architecture is intentionally composable: each slot can evolve independently while the control plane preserves determinism, explainability, and operational safety.'))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '2) Visual Diagram A: Platform Topology' -Bold $true))
$parts.Add((New-TextParagraph -Text 'This diagram illustrates the distributed slot fabric and the centralized policy authority that normalizes outcomes across heterogeneous agent implementations.'))
$parts.Add((New-ImageParagraph -RelId 'rIdImg1' -DocPrId 101 -Name 'Platform Topology' -Cx $maxImageCx -Cy $image1Cy))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '3) Visual Diagram B: Orchestration Sequence' -Bold $true))
$parts.Add((New-TextParagraph -Text 'This sequence highlights deterministic stage progression, bounded retry semantics, and decision gates that can terminate downstream flow on escalation or denial conditions.'))
$parts.Add((New-ImageParagraph -RelId 'rIdImg2' -DocPrId 102 -Name 'Orchestration Sequence' -Cx $maxImageCx -Cy $image2Cy))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '4) Visual Diagram C: YAML Control Surface' -Bold $true))
$parts.Add((New-TextParagraph -Text 'This control map shows why the platform is pluggable: slot abstraction, active version pointers, version catalogs, runtime transport independence, and operational kill-switch controls.'))
$parts.Add((New-ImageParagraph -RelId 'rIdImg3' -DocPrId 103 -Name 'YAML Control Surface' -Cx $maxImageCx -Cy $image3Cy))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '5) Why This Is Pluggable and Configurable (YAML Deep Dive)' -Bold $true))
$parts.Add((New-TextParagraph -Text '- Slot abstraction separates business capability from provider implementation, enabling clear domain boundaries.'))
$parts.Add((New-TextParagraph -Text '- Active-version routing enables release governance by configuration, not by code redeployment.'))
$parts.Add((New-TextParagraph -Text '- Version catalogs support migration, rollback, and blue-green deployment patterns without orchestration redesign.'))
$parts.Add((New-TextParagraph -Text '- The type dimension enables seamless HTTP and local execution modes under one contract-first runtime.'))
$parts.Add((New-TextParagraph -Text '- timeout_ms and enabled fields form an operational resilience layer for latency and incident control.'))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '6) Feature Highlights with Enterprise Positioning' -Bold $true))
$parts.Add((New-TextParagraph -Text 'Feature: Event-Native Orchestration | Value: Modular extensibility with clear stage contracts.'))
$parts.Add((New-TextParagraph -Text 'Feature: Deterministic State Machine | Value: High-assurance lifecycle governance and audit precision.'))
$parts.Add((New-TextParagraph -Text 'Feature: Central Decision Gateway | Value: Unified risk posture and policy-consistent final outcomes.'))
$parts.Add((New-TextParagraph -Text 'Feature: Hybrid AI + Rules Intelligence | Value: Better automation while maintaining explainability and control.'))
$parts.Add((New-TextParagraph -Text 'Feature: Trace-Centric Observability | Value: Fast diagnostics, governance transparency, and regulator-ready evidence.'))
$parts.Add((New-TextParagraph -Text ' '))

$parts.Add((New-TextParagraph -Text '7) Implementation Anchors in Current Codebase' -Bold $true))
$parts.Add((New-TextParagraph -Text '- Entry and API control surface: src/index.ts'))
$parts.Add((New-TextParagraph -Text '- Workflow orchestration: src/orchestrator/orchestrator.ts'))
$parts.Add((New-TextParagraph -Text '- State lifecycle model: src/orchestrator/stateMachine.ts'))
$parts.Add((New-TextParagraph -Text '- Decision governance: src/decisionGateway/decisionGateway.ts'))
$parts.Add((New-TextParagraph -Text '- Config registry and YAML loading: src/registry/agentRegistry.ts + config/agents.yaml'))
$parts.Add((New-TextParagraph -Text '- Conversational document onboarding: src/chatbot/onboardingChatbot.ts'))

$bodyXml = ($parts -join "`n")

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
$bodyXml
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@
Write-Utf8File -Path (Join-Path $tmpRoot 'word\document.xml') -Content $documentXml

$zipPath = Join-Path $repoRoot ($OutFile + '.zip')
$finalPath = Join-Path $repoRoot $OutFile

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $finalPath) { Remove-Item $finalPath -Force }

Compress-Archive -Path (Join-Path $tmpRoot '*') -DestinationPath $zipPath -Force
Rename-Item -Path $zipPath -NewName $OutFile -Force

Remove-Item -Path $tmpRoot -Recurse -Force

$result = [PSCustomObject]@{
  Docx = (Join-Path $repoRoot $OutFile)
  Diagram1Svg = $diag1Path
  Diagram2Svg = $diag2Path
  Diagram3Svg = $diag3Path
  Diagram1Png = $png1Path
  Diagram2Png = $png2Path
  Diagram3Png = $png3Path
}
$result | Format-List
