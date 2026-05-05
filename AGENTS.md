<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Turkish Character Rule
All files must be saved with UTF-8 encoding. NEVER corrupt Turkish characters (ğ, ş, ı, ç, ö, ü, Ğ, Ş, İ, Ç, Ö, Ü). 
When editing existing files or writing new ones, you MUST preserve the correct representation of these characters.
Do not use scripts or tools that mess up encoding. Always ensure the text is visually correct.

# Data Integrity and Validation Rules
1. **No Breaking Changes:** When adding new features (e.g., Dyehouse module), ensure that existing core features (e.g., Party saving, Raw production) remain fully functional.
2. **Subsequent Transaction Validation:** Before allowing any deletion or significant update to a record (Purchase, Production, Sale, Transfer), always use `checkSubsequentTransactions` to verify that no dependent operations exist.
3. **User Guidance:** Validation errors must not be generic. They must explicitly list the dependent transactions (date and type) and guide the user to delete/reverse records in reverse chronological order (from most recent to oldest).
4. **Live Data Safety:** Always perform end-to-end tests for stock-impacting changes using temporary test data and ensure full cleanup after testing.
