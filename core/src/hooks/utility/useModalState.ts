/**
 * Modal State Hook
 *
 * Generic hook for managing modal dialog state including:
 * - Open/close states
 * - Delete confirmation
 * - Selected item tracking
 * - Loading/confirming states
 */

'use client';

import { useState, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface ModalState<T> {
  isModalOpen: boolean;
  deleteConfirmOpen: boolean;
  isConfirming: boolean;
  selectedItem: T | null;
  viewingItem: T | null;
}

export interface UseModalStateReturn<T> extends ModalState<T> {
  openModal: () => void;
  closeModal: () => void;
  startConfirming: () => void;
  stopConfirming: () => void;
  openDeleteConfirm: (item: T) => void;
  closeDeleteConfirm: () => void;
  selectItem: (item: T) => void;
  viewItem: (item: T | null) => void;
  resetState: () => void;
}

// =============================================================================
// DEFAULT STATE
// =============================================================================

function getInitialState<T>(): ModalState<T> {
  return {
    isModalOpen: false,
    deleteConfirmOpen: false,
    isConfirming: false,
    selectedItem: null,
    viewingItem: null,
  };
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing modal state
 *
 * @example
 * function UserList() {
 *   const {
 *     isModalOpen,
 *     selectedItem,
 *     deleteConfirmOpen,
 *     openModal,
 *     closeModal,
 *     selectItem,
 *     openDeleteConfirm,
 *     closeDeleteConfirm,
 *   } = useModalState<User>();
 *
 *   return (
 *     <div>
 *       <button onClick={openModal}>Add User</button>
 *
 *       {users.map(user => (
 *         <div key={user.id}>
 *           {user.name}
 *           <button onClick={() => selectItem(user)}>Edit</button>
 *           <button onClick={() => openDeleteConfirm(user)}>Delete</button>
 *         </div>
 *       ))}
 *
 *       <UserModal
 *         open={isModalOpen}
 *         onClose={closeModal}
 *         user={selectedItem}
 *       />
 *
 *       <DeleteConfirmDialog
 *         open={deleteConfirmOpen}
 *         onClose={closeDeleteConfirm}
 *         onConfirm={() => handleDelete(selectedItem)}
 *       />
 *     </div>
 *   );
 * }
 */
export function useModalState<T>(): UseModalStateReturn<T> {
  const [state, setState] = useState<ModalState<T>>(getInitialState);

  const openModal = useCallback(() => {
    setState((prev) => ({ ...prev, isModalOpen: true }));
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isModalOpen: false,
      isConfirming: false,
      selectedItem: null,
    }));
  }, []);

  const startConfirming = useCallback(() => {
    setState((prev) => ({ ...prev, isConfirming: true }));
  }, []);

  const stopConfirming = useCallback(() => {
    setState((prev) => ({ ...prev, isConfirming: false }));
  }, []);

  const openDeleteConfirm = useCallback((item: T) => {
    setState((prev) => ({
      ...prev,
      deleteConfirmOpen: true,
      selectedItem: item,
    }));
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      deleteConfirmOpen: false,
      selectedItem: null,
    }));
  }, []);

  const selectItem = useCallback((item: T) => {
    setState((prev) => ({
      ...prev,
      selectedItem: item,
      isModalOpen: true,
    }));
  }, []);

  const viewItem = useCallback((item: T | null) => {
    setState((prev) => ({
      ...prev,
      viewingItem: item,
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(getInitialState());
  }, []);

  return {
    ...state,
    openModal,
    closeModal,
    startConfirming,
    stopConfirming,
    openDeleteConfirm,
    closeDeleteConfirm,
    selectItem,
    viewItem,
    resetState,
  };
}
