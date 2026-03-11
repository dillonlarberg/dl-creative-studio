import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import type { EditImageStepData } from './types';
import { SelectImageStep } from './steps/SelectImageStep';
import { ChooseEditTypeStep } from './steps/ChooseEditTypeStep';
import { CanvasStep } from './steps/CanvasStep';
import { NewBackgroundStep } from './steps/NewBackgroundStep';
import { PreviewStep } from './steps/PreviewStep';
import { ApproveDownloadStep } from './steps/ApproveDownloadStep';

interface EditImageWizardProps {
  currentStepId: string;
  stepData: Record<string, any>;
  onStepDataChange: (updates: Record<string, any>) => void;
  clientSlug: string;
  assetHouse: ClientAssetHouse | null;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function EditImageWizard({
  currentStepId,
  stepData,
  onStepDataChange,
  clientSlug,
  assetHouse,
  isLoading,
  setIsLoading,
}: EditImageWizardProps) {
  const editStepData = stepData as unknown as EditImageStepData;

  const handleUpdate = (updates: Partial<EditImageStepData>) => {
    onStepDataChange({ ...stepData, ...updates });
  };

  const sharedProps = {
    stepData: editStepData,
    onStepDataChange: handleUpdate,
    clientSlug,
    assetHouse,
    isLoading,
    setIsLoading,
  };

  switch (currentStepId) {
    case 'select':
      return <SelectImageStep {...sharedProps} />;
    case 'edit-type':
      return <ChooseEditTypeStep {...sharedProps} />;
    case 'canvas':
      return <CanvasStep {...sharedProps} />;
    case 'new-background':
      return <NewBackgroundStep {...sharedProps} />;
    case 'preview':
      return <PreviewStep {...sharedProps} />;
    case 'approve':
      return <ApproveDownloadStep {...sharedProps} />;
    default:
      return null;
  }
}
