# @knowledgeos/database

PostgreSQL system-of-record layer for KnowledgeOS.

This package owns the Drizzle schema, migrations, database client factory, and repositories. PostgreSQL remains authoritative; future graph or search indexes should be derived from the records managed here.

