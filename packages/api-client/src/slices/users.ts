import { api, createListQuery } from '../api';
import type { Paginated } from '@hub-store/shared';

/**
 * SF-8 — Users management slice. BFF endpoints: GET/POST /users,
 * POST /users/:id/set-password, PUT /users/:id/enabled (Manager-only).
 */
export interface UserListItem {
  id: string;
  username: string;
  enabled: boolean;
  roles: string[];
}

export interface CreateUserArg {
  username: string;
  password: string;
  role: string;
}

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query(
      createListQuery<void, Paginated<UserListItem>>({
        query: () => ({ url: '/users', method: 'GET' }),
        providesTags: () => [{ type: 'Users' as const, id: 'LIST' }],
      }),
    ),
    createUser: builder.mutation<UserListItem, CreateUserArg>({
      query: (body) => ({ url: '/users', method: 'POST', data: body }),
      invalidatesTags: [{ type: 'Users' as const, id: 'LIST' }],
    }),
    setUserPassword: builder.mutation<{ ok: boolean }, { userId: string; password: string }>({
      query: ({ userId, password }) => ({
        url: `/users/${encodeURIComponent(userId)}/set-password`,
        method: 'POST',
        data: { password },
      }),
    }),
    setUserEnabled: builder.mutation<{ ok: boolean }, { userId: string; enabled: boolean }>({
      query: ({ userId, enabled }) => ({
        url: `/users/${encodeURIComponent(userId)}/enabled`,
        method: 'PUT',
        data: { enabled },
      }),
      invalidatesTags: [{ type: 'Users' as const, id: 'LIST' }],
    }),
  }),
});

export const { useListUsersQuery, useCreateUserMutation, useSetUserPasswordMutation, useSetUserEnabledMutation } = enhanced;
/** Same singleton as `api`, statically typed with this slice's endpoints. */
export const usersApi = enhanced;
