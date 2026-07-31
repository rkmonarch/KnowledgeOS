# @knowledgeos/ingestion

Source ingestion package.

Milestone one supports Markdown and plain text. It creates sources, stores content-addressed revisions, splits Markdown by semantic headings, preserves line references, and enqueues extraction jobs. Connector interfaces live here so future sources can be added without changing the compiler.

