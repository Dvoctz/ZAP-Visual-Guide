import { Pose, ShootEvent, ReferenceImageData, ReferenceProviderId, ProviderId, ProviderStatus, EnvironmentReference } from '../../types';

export type { ReferenceProviderId, ProviderId, ProviderStatus };

export interface ProviderCapabilities {
  generate: boolean;
  upload: boolean;
}

export interface ReferenceProvider {
  id: ReferenceProviderId;
  name: string;
  model?: string;
  type: 'ai' | 'upload';
  status: ProviderStatus;
  statusMessage: string;
  statusReason?: string;
  description: string;
  badgeText: string;
  capabilities: ProviderCapabilities;
  generate?: (
    event: ShootEvent,
    pose: Pose,
    overallConcept?: string,
    prompt?: string,
    environment?: EnvironmentReference
  ) => Promise<ReferenceImageData>;
  upload?: (file: File) => Promise<ReferenceImageData>;
}
