# Bounded Bookmarks migration requests

Development boundary: the existing `/api/v1/migration` POST now validates a bounded JSON request before dispatching to an existing importer. Limits default to 10 MiB; operators may configure a whole-number `IMPORT_LIMIT` from 1 to 100 MiB. Invalid configuration cannot disable the cap.

A declared Content-Length greater than the limit receives HTTP 413 immediately. Unknown-length or incorrectly declared bodies are still measured as they stream: after exceeding the cap, the parser releases the buffered data, detaches accumulation listeners and drains the remainder instead of collecting it. JSON parse errors, truncated/aborted streams, missing data or unsupported format values receive HTTP 400 without an importer write.

This change does not qualify the inherited import implementations, archive filesystem effects, account authorization, database transactions, rate limits, or deployability. Test with authorized synthetic data and a disposable database before migration acceptance. The helper is isolated and covered by focused stream tests and CI.
