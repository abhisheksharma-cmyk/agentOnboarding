param(
  [string]$OutFile = 'AGENTIC_ONBOARDING_TECHNICAL_DOC.docx'
)

$ErrorActionPreference = 'Stop'
$tmpRoot = Join-Path $env:TEMP ("docx_build_" + [guid]::NewGuid().ToString())
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    [System.IO.Directory]::CreateDirectory($dir) | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

[System.IO.Directory]::CreateDirectory($tmpRoot) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot '_rels')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'docProps')) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $tmpRoot 'word')) | Out-Null

$ct = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@
Write-Utf8File -Path (Join-Path $tmpRoot '[Content_Types].xml') -Content $ct

$rels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@
Write-Utf8File -Path (Join-Path $tmpRoot '_rels\.rels') -Content $rels

$created = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$core = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Agentic Onboarding Platform - Technical Architecture and Marketing Brief</dc:title>
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

function New-ParagraphXml {
  param(
    [string]$Text,
    [bool]$Bold = $false,
    [bool]$Code = $false
  )

  $escaped = [System.Security.SecurityElement]::Escape($Text)

  if ($Code) {
    return ('<w:p><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
  }

  if ($Bold) {
    return ('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
  }

  return ('<w:p><w:r><w:t xml:space="preserve">{0}</w:t></w:r></w:p>' -f $escaped)
}

$lines = @(
  @{ t = 'AGENTIC ONBOARDING PLATFORM'; b = $true; c = $false },
  @{ t = 'Architectural Positioning, Feature Intelligence, and YAML Control-Surface Brief'; b = $true; c = $false },
  @{ t = 'Edition: Executive Technical Narrative | Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '1) Executive Abstract'; b = $true; c = $false },
  @{ t = 'Agentic Onboarding is a policy-governed, multi-agent decision fabric engineered for high-assurance onboarding and underwriting workflows.'; b = $false; c = $false },
  @{ t = 'The platform combines AI-led interpretation, deterministic controls, event-native orchestration, and auditable governance to deliver explainable automation at enterprise scale.'; b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '2) Architecture Diagram Portfolio'; b = $true; c = $false },
  @{ t = 'Diagram A: Platform Topology'; b = $true; c = $false },
  @{ t = '+----------------------+      +----------------------+      +--------------------------+'; b = $false; c = $true },
  @{ t = '|  Client Experience   | ---> |   Express API Layer  | ---> | Event Bus + Orchestrator |'; b = $false; c = $true },
  @{ t = '|  chat + document UX  |      | /onboarding/* /chat* |      | state machine + retries  |'; b = $false; c = $true },
  @{ t = '+----------------------+      +----------------------+      +--------------------------+'; b = $false; c = $true },
  @{ t = '                                                             |'; b = $false; c = $true },
  @{ t = '                                                             v'; b = $false; c = $true },
  @{ t = '   +-------------------+   +-------------------+   +-------------------+   +-------------------+   +-------------------+'; b = $false; c = $true },
  @{ t = '   |   KYC Wrapper     |   | Address Wrapper   |   |   AML Wrapper     |   |  Credit Wrapper   |   |   Risk Wrapper    |'; b = $false; c = $true },
  @{ t = '   | (HTTP/local slot) |   | (HTTP/local slot) |   | (HTTP/local slot) |   | (HTTP/local slot) |   | (local heuristic) |'; b = $false; c = $true },
  @{ t = '   +-------------------+   +-------------------+   +-------------------+   +-------------------+   +-------------------+'; b = $false; c = $true },
  @{ t = '             \                 \                     \                     \                    /'; b = $false; c = $true },
  @{ t = '              \                 \                     \                     \                  /'; b = $false; c = $true },
  @{ t = '               -------------------> Decision Gateway (Policy Authority) <---------------------'; b = $false; c = $true },
  @{ t = '                                      | confidence | risk flags | final mandate |'; b = $false; c = $true },
  @{ t = '                                      v'; b = $false; c = $true },
  @{ t = '                                APPROVE / ESCALATE / DENY'; b = $false; c = $true },
  @{ t = ''; b = $false; c = $false },

  @{ t = 'Diagram B: Event-Driven Execution Sequence'; b = $true; c = $false },
  @{ t = 'START -> onboarding.started -> KYC -> ADDRESS_VERIFICATION -> AML -> CREDIT -> RISK -> FINISHED'; b = $false; c = $true },
  @{ t = '          | each transition is validated, persisted, and time-stamped |'; b = $false; c = $true },
  @{ t = '          | retry policy with exponential backoff on selected agent invocations |'; b = $false; c = $true },
  @{ t = '          | controlled early termination when deny or escalate thresholds are met |'; b = $false; c = $true },
  @{ t = ''; b = $false; c = $false },

  @{ t = 'Diagram C: YAML-Orchestrated Agent Routing'; b = $true; c = $false },
  @{ t = 'config/agents.yaml'; b = $false; c = $true },
  @{ t = 'agents:'; b = $false; c = $true },
  @{ t = '  KYC:'; b = $false; c = $true },
  @{ t = '    active: kyc_agent_v1'; b = $false; c = $true },
  @{ t = '    versions:'; b = $false; c = $true },
  @{ t = '      kyc_agent_v1:'; b = $false; c = $true },
  @{ t = '        type: http'; b = $false; c = $true },
  @{ t = '        endpoint: http://localhost:5005/agents/kyc2/decide'; b = $false; c = $true },
  @{ t = '        timeout_ms: 1500'; b = $false; c = $true },
  @{ t = '        enabled: true'; b = $false; c = $true },
  @{ t = '  AML, CREDIT, ADDRESS_VERIFICATION, and RISK follow the same slot-version contract.'; b = $false; c = $true },
  @{ t = ''; b = $false; c = $false },

  @{ t = '3) Feature Intelligence Highlights'; b = $true; c = $false },
  @{ t = 'Feature 1: Event-Native Control Plane'; b = $true; c = $false },
  @{ t = '- Business stages are decoupled through onboarding.* events, enabling modular extensibility and low-friction evolution.'; b = $false; c = $false },
  @{ t = 'Feature 2: Deterministic Lifecycle Governance'; b = $true; c = $false },
  @{ t = '- The state machine encodes explicit, auditable transitions, preventing ambiguous workflow progression.'; b = $false; c = $false },
  @{ t = 'Feature 3: Central Decision Sovereignty'; b = $true; c = $false },
  @{ t = '- Agent proposals remain advisory; final adjudication is centralized in the Decision Gateway.'; b = $false; c = $false },
  @{ t = 'Feature 4: Domain-Specialized Agent Mesh'; b = $true; c = $false },
  @{ t = '- KYC, Address, AML, Credit, and Risk are decomposed into independent decision surfaces with shared governance.'; b = $false; c = $false },
  @{ t = 'Feature 5: Hybrid Intelligence Model'; b = $true; c = $false },
  @{ t = '- LLM-driven extraction is fused with deterministic policy checks such as checksum, recency, format, and consistency controls.'; b = $false; c = $false },
  @{ t = 'Feature 6: Advanced Document Intelligence'; b = $true; c = $false },
  @{ t = '- OCR and PDF parsing pipelines accelerate data acquisition while confirmation loops preserve data quality.'; b = $false; c = $false },
  @{ t = 'Feature 7: Reliability Engineering by Default'; b = $true; c = $false },
  @{ t = '- Timeout controls, retry envelopes, and explicit error states protect throughput under partial service degradation.'; b = $false; c = $false },
  @{ t = 'Feature 8: Compliance-Ready Observability'; b = $true; c = $false },
  @{ t = '- Trace identifiers, audit events, and transition metadata establish support-grade and regulator-grade transparency.'; b = $false; c = $false },
  @{ t = 'Feature 9: Runtime Version Agility'; b = $true; c = $false },
  @{ t = '- Active-version switching allows controlled rollout, rollback, and progressive migration without orchestrator rewiring.'; b = $false; c = $false },
  @{ t = 'Feature 10: Contract-First Interoperability'; b = $true; c = $false },
  @{ t = '- Uniform request and response envelopes enable provider independence across HTTP and local execution modes.'; b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '4) Why YAML Makes the Platform Pluggable and Configurable'; b = $true; c = $false },
  @{ t = 'A) Slot Abstraction'; b = $true; c = $false },
  @{ t = '- Each business capability maps to a stable slot contract: KYC, ADDRESS_VERIFICATION, AML, CREDIT, and RISK.'; b = $false; c = $false },
  @{ t = 'B) Active Version Pointer'; b = $true; c = $false },
  @{ t = '- The active field defines the production route at runtime, enabling release governance through configuration.'; b = $false; c = $false },
  @{ t = 'C) Version Catalog'; b = $true; c = $false },
  @{ t = '- The versions map supports coexistence of multiple implementations for blue-green deployment and controlled experimentation.'; b = $false; c = $false },
  @{ t = 'D) Transport and Runtime Independence'; b = $true; c = $false },
  @{ t = '- The type field abstracts execution mode, allowing seamless switching between remote HTTP services and local strategies.'; b = $false; c = $false },
  @{ t = 'E) Operational Safety Controls'; b = $true; c = $false },
  @{ t = '- timeout_ms and enabled provide practical guardrails for latency governance and emergency shutdown.'; b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '5) YAML-Driven Operating Patterns'; b = $true; c = $false },
  @{ t = 'Pattern 1: Blue-Green Agent Promotion'; b = $true; c = $false },
  @{ t = '- Introduce kyc_agent_v2 in versions, validate externally, then move active from v1 to v2 in a controlled release window.'; b = $false; c = $false },
  @{ t = 'Pattern 2: Circuit-Breaker Disablement'; b = $true; c = $false },
  @{ t = '- Set enabled: false on unstable versions to immediately stop routing while preserving orchestration continuity.'; b = $false; c = $false },
  @{ t = 'Pattern 3: SLA-Centric Timeout Tuning'; b = $true; c = $false },
  @{ t = '- Align timeout_ms per slot to provider behavior to avoid upstream congestion and cascading latency.'; b = $false; c = $false },
  @{ t = 'Pattern 4: Provider Substitution Without Code Refactor'; b = $true; c = $false },
  @{ t = '- Update endpoint under the active version to swap providers while preserving the slot contract and decision pathway.'; b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '6) Market-Ready Messaging'; b = $true; c = $false },
  @{ t = '- Composable Underwriting Intelligence Platform'; b = $false; c = $false },
  @{ t = '- Policy-Governed Autonomous Onboarding Fabric'; b = $false; c = $false },
  @{ t = '- Explainable AI Automation with Deterministic Guardrails'; b = $false; c = $false },
  @{ t = '- Versioned Agent Mesh with Real-Time Configurability'; b = $false; c = $false },
  @{ t = ''; b = $false; c = $false },

  @{ t = '7) Reference Map to Current Implementation'; b = $true; c = $false },
  @{ t = '- API entry and route surface: src/index.ts'; b = $false; c = $false },
  @{ t = '- Orchestration runtime: src/orchestrator/orchestrator.ts'; b = $false; c = $false },
  @{ t = '- State lifecycle contract: src/orchestrator/stateMachine.ts'; b = $false; c = $false },
  @{ t = '- Final policy governance: src/decisionGateway/decisionGateway.ts'; b = $false; c = $false },
  @{ t = '- Config and slot registry: src/registry/agentRegistry.ts + config/agents.yaml'; b = $false; c = $false },
  @{ t = '- Conversational onboarding and document intake: src/chatbot/onboardingChatbot.ts'; b = $false; c = $false },
  @{ t = '- External agent adapter layer: src/utils/httpHelper.ts'; b = $false; c = $false }
)

$paragraphs = foreach ($line in $lines) {
  New-ParagraphXml -Text $line.t -Bold $line.b -Code $line.c
}

$body = $paragraphs -join "`n"

$docXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $body
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"@
Write-Utf8File -Path (Join-Path $tmpRoot 'word\document.xml') -Content $docXml

$zipPath = Join-Path (Get-Location) ($OutFile + '.zip')
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

Compress-Archive -Path (Join-Path $tmpRoot '*') -DestinationPath $zipPath -Force
Rename-Item -Path $zipPath -NewName $OutFile -Force
Remove-Item -Path $tmpRoot -Recurse -Force

Get-Item $OutFile | Select-Object FullName, Length, LastWriteTime
