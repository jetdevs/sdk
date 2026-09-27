/**
 * Users UI Hooks
 *
 * Headless hooks for user management UI logic.
 *
 * @module @jetdevs/core/features/users/ui/hooks
 */

export {
  useUserFormLogic,
  type UseUserFormLogicConfig,
  type UserFormLogicReturn,
  type UserFormState,
  type UserFormFieldErrors,
  type UserRoleAssignmentDisplay,
  type RoleData,
  type UserFormOrgData,
  type EditUserData,
} from "./useUserFormLogic";

export {
  useDeleteUserLogic,
  type UseDeleteUserLogicConfig,
  type DeleteUserLogicReturn,
  type DeleteUserData,
  type UserRoleImpact,
} from "./useDeleteUserLogic";

export {
  useUserDataTableLogic,
  type UseUserDataTableLogicConfig,
  type UserDataTableLogicReturn,
  type UserData,
  type UsersPaginationState,
  type UsersSortingState,
  type UserStatusFilter,
  type UserDataTableApi,
} from "./useUserDataTableLogic";
