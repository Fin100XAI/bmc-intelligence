import { useQuery, useQueryClient, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { User } from '@/types/organisation'
import { useCurrentUser } from '@/stores/auth.store'

/**
 * The single bridge between the service layer and the interface.
 *
 * Every page reads through a hook built on this. Components never import a
 * data module directly, so replacing the demonstration services with real
 * departmental APIs requires no change above this line.
 *
 * The acting principal is injected automatically and forms part of the query
 * key, so switching role re-fetches through the permission engine rather than
 * serving another principal's cached view.
 */
export function useServiceQuery<T>(
  key: QueryKey,
  fetcher: (user: User) => Promise<T>,
  options: { enabled?: boolean; staleTime?: number; refetchInterval?: number } = {},
): UseQueryResult<T, Error> {
  const user = useCurrentUser()

  return useQuery<T, Error>({
    queryKey: [...key, user?.id ?? 'anonymous', user?.roleId ?? 'none'],
    queryFn: async () => {
      if (!user) throw new Error('No authenticated principal. The request was not issued.')
      return fetcher(user)
    },
    enabled: Boolean(user) && (options.enabled ?? true),
    staleTime: options.staleTime,
    // Opt-in only - the global default leaves this undefined, so every
    // existing call site keeps the "never silently reshuffle beneath an
    // operator" behaviour. A caller passes this only where the underlying
    // collection is genuinely live (see `LiveIndicator`).
    refetchInterval: options.refetchInterval,
    refetchIntervalInBackground: false,
  })
}

/**
 * Mutating service calls. Every municipal action - a transition, an
 * assignment, a decision - routes through here so that invalidation and audit
 * behaviour are uniform.
 */
export function useServiceAction<TArgs extends unknown[], TResult>(
  action: (user: User, ...args: TArgs) => Promise<TResult>,
  invalidateKeys: QueryKey[] = [],
): (...args: TArgs) => Promise<TResult> {
  const user = useCurrentUser()
  const queryClient = useQueryClient()

  return useCallback(
    async (...args: TArgs) => {
      if (!user) throw new Error('No authenticated principal. The action was not performed.')
      const result = await action(user, ...args)
      await Promise.all(invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })))
      return result
    },
    // `invalidateKeys` is a literal array at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, action, queryClient, JSON.stringify(invalidateKeys)],
  )
}

/** Invalidates every platform query - used after a workflow transition. */
export function useInvalidateAll(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['bmc-mii'] })
  }, [queryClient])
}
