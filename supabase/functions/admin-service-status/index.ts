import { requireUser } from '../_shared/http.ts';
import { createAdminServiceStatusHandler } from '../_shared/admin-service-status.ts';

Deno.serve(async req => {
  let context: Awaited<ReturnType<typeof requireUser>> | null = null;
  return createAdminServiceStatusHandler({
    authorize: async request => {
      try { context = await requireUser(request); } catch { return 'unauthenticated'; }
      const role = await context.userClient.rpc('nava_is_admin');
      if (role.error) throw new Error('authorization_unavailable');
      return role.data === true ? 'admin' : 'member';
    },
    environment: name => Deno.env.get(name),
    readFoodObservations: async () => {
      if (!context?.adminClient) throw new Error('observation_unavailable');
      const result = await context.adminClient.from('food_render_jobs')
        .select('state,last_error_code,updated_at')
        .in('state', ['ready', 'failed', 'needs_details'])
        .gte('updated_at', new Date(Date.now() - 86_400_000).toISOString())
        .order('updated_at', { ascending: false }).limit(50).abortSignal(AbortSignal.timeout(8_000));
      if (result.error) throw new Error('observation_unavailable');
      return result.data ?? [];
    },
    fetch: globalThis.fetch,
    now: () => new Date(),
  })(req);
});
