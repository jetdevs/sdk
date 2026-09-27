/**
 * Form UI Components
 *
 * Components for capturing input:
 * - ImageUpload: drag-and-drop image drop zone with preview (factory)
 *
 * @module @jetdevs/core/ui/forms
 */

// Types
export type {
  ImageUploadFactoryConfig,
  ImageUploadProps,
  ImageUploadUIComponents,
} from "./types";

// Components
export { createImageUpload } from "./image-upload";
