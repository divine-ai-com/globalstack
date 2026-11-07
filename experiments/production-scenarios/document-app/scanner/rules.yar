// Harmless pilot detection fixture. This rule is not a production malware feed.
rule PilotDocumentDetection {
    meta:
        description = "Detect the explicit synthetic document test marker"
    strings:
        $marker = "PILOT_DOCUMENT_DETECTION_73261"
    condition:
        $marker
}
