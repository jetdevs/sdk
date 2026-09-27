/**
 * User Form Logic Hook
 *
 * Headless hook that encapsulates all business logic for user form management.
 * Handles form state, validation, role assignments, and submission for both
 * create and edit modes.
 *
 * @module @jetdevs/core/features/users/ui/hooks/useUserFormLogic
 */

"use client";

import { useState, useCallback, useMemo, useEffect } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Form data structure for user create/edit (UI form state)
 */
export interface UserFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  username: string;
  password: string;
  isActive: boolean;
}

/**
 * Role assignment display data for UI (includes display names)
 */
export interface UserRoleAssignmentDisplay {
  orgId: number;
  orgName: string;
  roleId: number;
  roleName: string;
  isActive: boolean;
  isGlobalRole?: boolean;
  roleType?: "global" | "org-specific";
}

/**
 * Validation errors for form fields
 */
export interface UserFormFieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  username?: string;
  password?: string;
}

/**
 * Role data from API
 */
export interface RoleData {
  id: number;
  name: string;
  isGlobalRole?: boolean;
  roleType?: "global" | "org-specific";
}

/**
 * Organization data from API
 */
export interface UserFormOrgData {
  id: number;
  name: string;
}

/**
 * User data for edit mode
 */
export interface EditUserData {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  username?: string | null;
  isActive: boolean;
  name?: string | null;
}

/**
 * Configuration for the useUserFormLogic hook
 */
export interface UseUserFormLogicConfig {
  /** Mode: create or edit */
  mode: "create" | "edit";

  /** Whether the dialog is open */
  isOpen: boolean;

  /** User data for edit mode */
  user?: EditUserData | null;

  /** Current organization ID */
  currentOrgId: number | null;

  /** Current organization data */
  currentOrg?: UserFormOrgData | null;

  /** Available roles for assignment */
  availableRoles: RoleData[];

  /** Whether roles are loading */
  rolesLoading?: boolean;

  /** User's existing role assignments (edit mode) */
  existingRoleAssignments?: UserRoleAssignmentDisplay[];

  /** Whether existing roles are loading */
  existingRolesLoading?: boolean;

  // API callbacks - decoupled from tRPC
  /** Callback to create/invite a user */
  onCreateUser: (data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    username: string;
    password: string;
    isActive: boolean;
  }) => Promise<{ id: number; message?: string }>;

  /** Callback to update a user */
  onUpdateUser: (data: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    username: string;
    password?: string;
    isActive: boolean;
  }) => Promise<void>;

  /** Callback to assign a role */
  onAssignRole: (data: {
    userId: number;
    roleId: number;
    orgId: number;
  }) => Promise<void>;

  /** Callback to remove a role */
  onRemoveRole: (data: {
    userId: number;
    roleId: number;
    orgId: number;
  }) => Promise<void>;

  /** Callback when form submission succeeds */
  onSuccess?: () => void;

  /** Callback when form submission fails */
  onError?: (error: Error) => void;

  /** Callback to close the dialog */
  onClose: () => void;
}

/**
 * Return type for useUserFormLogic hook
 */
export interface UserFormLogicReturn {
  // Form state
  formData: UserFormState;
  errors: UserFormFieldErrors;
  isSubmitting: boolean;
  isValid: boolean;

  // Password state
  showPassword: boolean;
  generatedPassword: string;
  isEditingPassword: boolean;
  changePassword: boolean;

  // Navigation state (wizard/tabs)
  currentStep: number;
  activeTab: string;

  // Role assignment state
  roleAssignments: UserRoleAssignmentDisplay[];
  newAssignment: { orgId: string; roleId: string };
  roleAssignmentsModified: boolean;
  filteredAvailableRoles: RoleData[];

  // Computed values
  isCreateMode: boolean;

  // Form field setters
  setFormField: <K extends keyof UserFormState>(
    field: K,
    value: UserFormState[K]
  ) => void;
  setFormData: (data: Partial<UserFormState>) => void;

  // Password actions
  toggleShowPassword: () => void;
  generatePassword: () => void;
  startEditingPassword: () => void;
  cancelEditingPassword: () => void;
  confirmPasswordChange: () => boolean;

  // Navigation actions
  setCurrentStep: (step: number) => void;
  setActiveTab: (tab: string) => void;
  handleNextStep: () => boolean;
  handlePreviousStep: () => void;

  // Role assignment actions
  setNewAssignment: (assignment: { orgId: string; roleId: string }) => void;
  handleAddRoleAssignment: () => { success: boolean; error?: string };
  handleRemoveRoleAssignment: (orgId: number, roleId: number) => void;
  handleToggleRoleAssignment: (orgId: number, roleId: number) => void;

  // Form actions
  validateForm: () => boolean;
  validateBasicFields: () => boolean;
  handleSubmit: () => Promise<{ success: boolean; error?: string }>;
  resetForm: () => void;
}

// =============================================================================
// VALIDATION
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateFormData(
  data: UserFormState,
  isCreateMode: boolean,
  changePassword: boolean
): UserFormFieldErrors {
  const errors: UserFormFieldErrors = {};

  // First name
  if (!data.firstName.trim()) {
    errors.firstName = "First name is required";
  } else if (data.firstName.length > 50) {
    errors.firstName = "First name must be less than 50 characters";
  }

  // Last name
  if (!data.lastName.trim()) {
    errors.lastName = "Last name is required";
  } else if (data.lastName.length > 50) {
    errors.lastName = "Last name must be less than 50 characters";
  }

  // Email
  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.email = "Please enter a valid email address";
  } else if (data.email.length > 255) {
    errors.email = "Email must be less than 255 characters";
  }

  // Phone (optional)
  if (data.phone && data.phone.length > 20) {
    errors.phone = "Phone number must be less than 20 characters";
  }

  // Username
  if (!data.username.trim()) {
    errors.username = "Username is required for login";
  } else if (data.username.length < 3) {
    errors.username = "Username must be at least 3 characters";
  } else if (data.username.length > 50) {
    errors.username = "Username must be less than 50 characters";
  } else if (!USERNAME_REGEX.test(data.username)) {
    errors.username =
      "Username can only contain letters, numbers, underscores, and hyphens";
  }

  // Password
  if (isCreateMode || changePassword) {
    if (!data.password.trim()) {
      errors.password = "Password is required";
    } else if (data.password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    } else if (data.password.length > 128) {
      errors.password = "Password must be less than 128 characters";
    }
  }

  return errors;
}

function validateBasicFieldsOnly(data: UserFormState): UserFormFieldErrors {
  const errors: UserFormFieldErrors = {};

  if (!data.firstName.trim()) {
    errors.firstName = "First name is required";
  }
  if (!data.lastName.trim()) {
    errors.lastName = "Last name is required";
  }
  if (!data.email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(data.email)) {
    errors.email = "Please enter a valid email address";
  }
  if (!data.username.trim()) {
    errors.username = "Username is required";
  } else if (data.username.length < 3) {
    errors.username = "Username must be at least 3 characters";
  }

  return errors;
}

// =============================================================================
// PASSWORD GENERATION
// =============================================================================

function generateSecurePassword(): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const getInitialFormData = (): UserFormState => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  username: "",
  password: "",
  isActive: true,
});

// =============================================================================
// HOOK
// =============================================================================

/**
 * Headless hook for user form logic
 *
 * @example
 * ```tsx
 * const formLogic = useUserFormLogic({
 *   mode: 'create',
 *   isOpen: true,
 *   currentOrgId: 1,
 *   availableRoles: roles,
 *   onCreateUser: async (data) => api.user.invite.mutateAsync(data),
 *   onUpdateUser: async (data) => api.user.update.mutateAsync(data),
 *   onAssignRole: async (data) => api.userOrg.assignRole.mutateAsync(data),
 *   onRemoveRole: async (data) => api.userOrg.removeRole.mutateAsync(data),
 *   onSuccess: () => toast.success('User saved!'),
 *   onClose: () => setOpen(false),
 * });
 *
 * // Use in UI
 * <Input
 *   value={formLogic.formData.firstName}
 *   onChange={(e) => formLogic.setFormField('firstName', e.target.value)}
 *   error={formLogic.errors.firstName}
 * />
 * ```
 */
export function useUserFormLogic(
  config: UseUserFormLogicConfig
): UserFormLogicReturn {
  const {
    mode,
    isOpen,
    user,
    currentOrgId,
    currentOrg,
    availableRoles,
    rolesLoading,
    existingRoleAssignments,
    existingRolesLoading,
    onCreateUser,
    onUpdateUser,
    onAssignRole,
    onRemoveRole,
    onSuccess,
    onError,
    onClose,
  } = config;

  const isCreateMode = mode === "create";

  // ---------------------------------------------------------------------------
  // FORM STATE
  // ---------------------------------------------------------------------------

  const [formData, setFormDataState] = useState<UserFormState>(
    getInitialFormData()
  );
  const [errors, setErrors] = useState<UserFormFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);

  // ---------------------------------------------------------------------------
  // PASSWORD STATE
  // ---------------------------------------------------------------------------

  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [changePassword, setChangePassword] = useState(false);

  // ---------------------------------------------------------------------------
  // NAVIGATION STATE
  // ---------------------------------------------------------------------------

  const [currentStep, setCurrentStep] = useState(1);
  const [activeTab, setActiveTab] = useState("basic");
  const [rolesTabVisited, setRolesTabVisited] = useState(false);

  // ---------------------------------------------------------------------------
  // ROLE ASSIGNMENT STATE
  // ---------------------------------------------------------------------------

  const [roleAssignments, setRoleAssignments] = useState<UserRoleAssignmentDisplay[]>(
    []
  );
  const [originalRoleAssignments, setOriginalRoleAssignments] = useState<
    UserRoleAssignmentDisplay[]
  >([]);
  const [roleAssignmentsModified, setRoleAssignmentsModified] = useState(false);
  const [roleAssignmentsInitialized, setRoleAssignmentsInitialized] =
    useState(false);
  const [newAssignment, setNewAssignment] = useState({
    orgId: "",
    roleId: "",
  });

  // ---------------------------------------------------------------------------
  // FORM INITIALIZATION
  // ---------------------------------------------------------------------------

  // Initialize form when dialog opens
  useEffect(() => {
    if (!isOpen || formInitialized) return;

    if (user && mode === "edit") {
      setFormDataState({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email,
        phone: user.phone || "",
        username: user.username || "",
        password: "",
        isActive: user.isActive,
      });
      setGeneratedPassword("");
      setChangePassword(false);
      setIsEditingPassword(false);
      setRoleAssignments([]);
      setOriginalRoleAssignments([]);
      setRoleAssignmentsModified(false);
      setRoleAssignmentsInitialized(false);
      setFormInitialized(true);
    } else if (isCreateMode) {
      setFormDataState(getInitialFormData());
      setRoleAssignments([]);
      setRoleAssignmentsModified(false);
      setGeneratedPassword("");
      setChangePassword(true);
      setIsEditingPassword(false);
      setFormInitialized(true);
    }
  }, [user, isOpen, mode, isCreateMode, formInitialized]);

  // Load existing role assignments in edit mode
  useEffect(() => {
    if (roleAssignmentsInitialized || roleAssignmentsModified) return;

    if (
      user &&
      isOpen &&
      mode === "edit" &&
      existingRoleAssignments &&
      existingRoleAssignments.length > 0 &&
      !existingRolesLoading
    ) {
      setRoleAssignments(existingRoleAssignments);
      setOriginalRoleAssignments(existingRoleAssignments);
      setRoleAssignmentsModified(false);
      setRoleAssignmentsInitialized(true);
    }
  }, [
    user,
    isOpen,
    mode,
    existingRoleAssignments,
    existingRolesLoading,
    roleAssignmentsInitialized,
    roleAssignmentsModified,
  ]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setActiveTab("basic");
      setShowPassword(false);
      setGeneratedPassword("");
      setRoleAssignments([]);
      setOriginalRoleAssignments([]);
      setRoleAssignmentsModified(false);
      setRolesTabVisited(false);
      setNewAssignment({ orgId: "", roleId: "" });
      setChangePassword(false);
      setIsEditingPassword(false);
      setFormInitialized(false);
      setRoleAssignmentsInitialized(false);
      setErrors({});
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // COMPUTED VALUES
  // ---------------------------------------------------------------------------

  const filteredAvailableRoles = useMemo(() => {
    if (!Array.isArray(availableRoles)) {
      return [];
    }
    // Filter out roles already assigned to current org
    return availableRoles.filter((role) => {
      return !roleAssignments.some(
        (assignment) =>
          assignment.roleId === role.id && assignment.orgId === currentOrgId
      );
    });
  }, [availableRoles, roleAssignments, currentOrgId]);

  const isValid = useMemo(() => {
    const validationErrors = validateFormData(
      formData,
      isCreateMode,
      changePassword
    );
    return Object.keys(validationErrors).length === 0;
  }, [formData, isCreateMode, changePassword]);

  // ---------------------------------------------------------------------------
  // FORM FIELD SETTERS
  // ---------------------------------------------------------------------------

  const setFormField = useCallback(
    <K extends keyof UserFormState>(field: K, value: UserFormState[K]) => {
      setFormDataState((prev) => ({ ...prev, [field]: value }));
      // Clear error when field is modified
      if (errors[field as keyof UserFormFieldErrors]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[field as keyof UserFormFieldErrors];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const setFormData = useCallback((data: Partial<UserFormState>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  // ---------------------------------------------------------------------------
  // PASSWORD ACTIONS
  // ---------------------------------------------------------------------------

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const generatePassword = useCallback(() => {
    const password = generateSecurePassword();
    setGeneratedPassword(password);
    setFormDataState((prev) => ({ ...prev, password }));
    setChangePassword(true);
    // Clear password error
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors.password;
      return newErrors;
    });
  }, []);

  const startEditingPassword = useCallback(() => {
    setIsEditingPassword(true);
  }, []);

  const cancelEditingPassword = useCallback(() => {
    setIsEditingPassword(false);
    setFormDataState((prev) => ({ ...prev, password: "" }));
    setGeneratedPassword("");
    setChangePassword(false);
  }, []);

  const confirmPasswordChange = useCallback(() => {
    if (formData.password && formData.password.trim() !== "") {
      setIsEditingPassword(false);
      setChangePassword(true);
      return true;
    }
    return false;
  }, [formData.password]);

  // ---------------------------------------------------------------------------
  // NAVIGATION ACTIONS
  // ---------------------------------------------------------------------------

  const handleSetActiveTab = useCallback((tab: string) => {
    setActiveTab(tab);
    if (tab === "roles") {
      setRolesTabVisited(true);
    }
  }, []);

  const handleNextStep = useCallback(() => {
    const basicErrors = validateBasicFieldsOnly(formData);

    // Also validate password for create mode
    if (isCreateMode) {
      if (!formData.password.trim()) {
        basicErrors.password = "Password is required";
      } else if (formData.password.length < 8) {
        basicErrors.password = "Password must be at least 8 characters";
      }
    }

    if (Object.keys(basicErrors).length > 0) {
      setErrors(basicErrors);
      return false;
    }

    setErrors({});
    setCurrentStep(2);
    return true;
  }, [formData, isCreateMode]);

  const handlePreviousStep = useCallback(() => {
    setCurrentStep(1);
  }, []);

  // ---------------------------------------------------------------------------
  // ROLE ASSIGNMENT ACTIONS
  // ---------------------------------------------------------------------------

  const handleAddRoleAssignment = useCallback((): {
    success: boolean;
    error?: string;
  } => {
    const orgId = newAssignment.orgId
      ? parseInt(newAssignment.orgId)
      : currentOrgId;

    if (!orgId || !newAssignment.roleId) {
      return { success: false, error: "Please select both organization and role" };
    }

    const role = availableRoles.find(
      (r) => r.id.toString() === newAssignment.roleId
    );
    if (!role) {
      return { success: false, error: "Invalid role selection" };
    }

    // Check for duplicates
    const exists = roleAssignments.some(
      (assignment) =>
        assignment.orgId === orgId &&
        assignment.roleId.toString() === newAssignment.roleId
    );
    if (exists) {
      return { success: false, error: "This role assignment already exists" };
    }

    const newRoleAssignment: UserRoleAssignmentDisplay = {
      orgId: orgId,
      orgName: currentOrg?.name || `Organization ${orgId}`,
      roleId: role.id,
      roleName: role.name,
      isActive: true,
      isGlobalRole: role.isGlobalRole,
      roleType: role.roleType,
    };

    setRoleAssignments((prev) => [...prev, newRoleAssignment]);
    setRoleAssignmentsModified(true);
    setNewAssignment({ orgId: "", roleId: "" });

    return { success: true };
  }, [
    newAssignment,
    currentOrgId,
    currentOrg,
    availableRoles,
    roleAssignments,
  ]);

  const handleRemoveRoleAssignment = useCallback(
    (orgId: number, roleId: number) => {
      setRoleAssignments((prev) =>
        prev.filter(
          (assignment) =>
            !(assignment.orgId === orgId && assignment.roleId === roleId)
        )
      );
      setRoleAssignmentsModified(true);
    },
    []
  );

  const handleToggleRoleAssignment = useCallback(
    (orgId: number, roleId: number) => {
      setRoleAssignments((prev) =>
        prev.map((assignment) =>
          assignment.orgId === orgId && assignment.roleId === roleId
            ? { ...assignment, isActive: !assignment.isActive }
            : assignment
        )
      );
      setRoleAssignmentsModified(true);
    },
    []
  );

  // ---------------------------------------------------------------------------
  // FORM ACTIONS
  // ---------------------------------------------------------------------------

  const validateForm = useCallback(() => {
    const validationErrors = validateFormData(
      formData,
      isCreateMode,
      changePassword
    );
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }, [formData, isCreateMode, changePassword]);

  const validateBasicFields = useCallback(() => {
    const basicErrors = validateBasicFieldsOnly(formData);
    setErrors(basicErrors);
    return Object.keys(basicErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    // Validate form
    const validationErrors = validateFormData(
      formData,
      isCreateMode,
      changePassword
    );
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return { success: false, error: "Please fix all errors before submitting" };
    }

    // Validate password requirements
    if (isCreateMode && (!formData.password || formData.password.trim() === "")) {
      return { success: false, error: "Password is required for new users" };
    }

    if (
      !isCreateMode &&
      changePassword &&
      (!formData.password || formData.password.trim() === "")
    ) {
      return {
        success: false,
        error: "Please enter a new password or cancel password change",
      };
    }

    setIsSubmitting(true);

    try {
      let userId: number;

      if (isCreateMode) {
        // Create user
        const result = await onCreateUser({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          username: formData.username,
          password: formData.password,
          isActive: formData.isActive,
        });

        if (!result || !result.id) {
          throw new Error("Failed to create user - no user ID returned");
        }
        userId = result.id;
      } else {
        // Update user
        if (!user) {
          throw new Error("No user to update");
        }

        await onUpdateUser({
          id: user.id,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          username: formData.username,
          password:
            changePassword && formData.password.trim() !== ""
              ? formData.password
              : undefined,
          isActive: formData.isActive,
        });
        userId = user.id;
      }

      // Handle role assignments
      if (isCreateMode) {
        // Create mode: add all role assignments for current org
        const currentOrgAssignments = roleAssignments.filter(
          (a) => a.orgId === currentOrgId
        );
        if (currentOrgAssignments.length > 0) {
          await Promise.all(
            currentOrgAssignments.map((assignment) =>
              onAssignRole({
                userId,
                roleId: assignment.roleId,
                orgId: assignment.orgId,
              })
            )
          );
        }
      } else if (roleAssignmentsModified || rolesTabVisited) {
        // Edit mode: calculate diff and only mutate what changed
        const originalCurrentOrgRoles = originalRoleAssignments.filter(
          (a) => a.orgId === currentOrgId
        );
        const currentOrgAssignments = roleAssignments.filter(
          (a) => a.orgId === currentOrgId
        );

        // Create sets for efficient lookup
        const originalRoleKeys = new Set(
          originalCurrentOrgRoles.map((r) => `${r.orgId}-${r.roleId}`)
        );
        const currentRoleKeys = new Set(
          currentOrgAssignments.map((r) => `${r.orgId}-${r.roleId}`)
        );

        // Find roles to remove
        const rolesToRemove = originalCurrentOrgRoles.filter(
          (r) => !currentRoleKeys.has(`${r.orgId}-${r.roleId}`)
        );

        // Find roles to add
        const rolesToAdd = currentOrgAssignments.filter(
          (r) => !originalRoleKeys.has(`${r.orgId}-${r.roleId}`)
        );

        // Execute mutations
        const mutations: Promise<void>[] = [];

        for (const role of rolesToRemove) {
          mutations.push(
            onRemoveRole({
              userId,
              orgId: role.orgId,
              roleId: role.roleId,
            })
          );
        }

        for (const role of rolesToAdd) {
          mutations.push(
            onAssignRole({
              userId,
              roleId: role.roleId,
              orgId: role.orgId,
            })
          );
        }

        if (mutations.length > 0) {
          await Promise.all(mutations);
        }
      }

      // Success - call callbacks
      onSuccess?.();
      onClose();

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to save user";
      onError?.(error instanceof Error ? error : new Error(errorMessage));
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formData,
    isCreateMode,
    changePassword,
    user,
    roleAssignments,
    originalRoleAssignments,
    roleAssignmentsModified,
    rolesTabVisited,
    currentOrgId,
    onCreateUser,
    onUpdateUser,
    onAssignRole,
    onRemoveRole,
    onSuccess,
    onError,
    onClose,
  ]);

  const resetForm = useCallback(() => {
    setFormDataState(getInitialFormData());
    setErrors({});
    setRoleAssignments([]);
    setOriginalRoleAssignments([]);
    setRoleAssignmentsModified(false);
    setGeneratedPassword("");
    setChangePassword(false);
    setIsEditingPassword(false);
    setCurrentStep(1);
    setActiveTab("basic");
    setFormInitialized(false);
    setRoleAssignmentsInitialized(false);
  }, []);

  // ---------------------------------------------------------------------------
  // RETURN
  // ---------------------------------------------------------------------------

  return {
    // Form state
    formData,
    errors,
    isSubmitting,
    isValid,

    // Password state
    showPassword,
    generatedPassword,
    isEditingPassword,
    changePassword,

    // Navigation state
    currentStep,
    activeTab,

    // Role assignment state
    roleAssignments,
    newAssignment,
    roleAssignmentsModified,
    filteredAvailableRoles,

    // Computed values
    isCreateMode,

    // Form field setters
    setFormField,
    setFormData,

    // Password actions
    toggleShowPassword,
    generatePassword,
    startEditingPassword,
    cancelEditingPassword,
    confirmPasswordChange,

    // Navigation actions
    setCurrentStep,
    setActiveTab: handleSetActiveTab,
    handleNextStep,
    handlePreviousStep,

    // Role assignment actions
    setNewAssignment,
    handleAddRoleAssignment,
    handleRemoveRoleAssignment,
    handleToggleRoleAssignment,

    // Form actions
    validateForm,
    validateBasicFields,
    handleSubmit,
    resetForm,
  };
}
