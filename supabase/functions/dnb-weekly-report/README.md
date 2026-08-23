# DNB weekly report adapter

This Edge Function is the only integration point between the NAVA app and the external DNB algorithm service.

Required secret after the algorithm team supplies the endpoint:

- `DNB_API_URL`: HTTPS endpoint for the DNB service.
- `DNB_API_KEY`: optional bearer token. Keep it in Supabase Edge Function secrets, never in the client app.

The function sends `nava.dnb.weekly.v1` with the authenticated user ID, requested period, coverage count, and the user's six record groups plus Apple Health snapshots. The DNB service should return one of:

- `ready`: real score, confidence, summary, recommendations, and model version.
- `insufficient_data`: required and available day counts plus a reason.
- `unavailable`: service-level failure reason.

Until `DNB_API_URL` exists, the function deliberately returns `unavailable`; it never substitutes the local baseline rhythm score for a DNB result.
