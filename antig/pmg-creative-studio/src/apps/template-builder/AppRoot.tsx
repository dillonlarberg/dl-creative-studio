import WizardShell from '../../platform/wizard/WizardShell';
import { SharedDataProvider } from '../../platform/wizard/SharedDataContext';
import { AssetHouseProvider } from '../../platform/assetHouse/AssetHouseContext';
import { TemplateBuilderProvider } from './TemplateBuilderContext';
import { useCurrentClient } from '../../platform/client/useCurrentClient';
import manifest from './manifest';
import type { TemplateBuilderStepData } from './types';

export default function TemplateBuilderAppRoot() {
  const { currentClient } = useCurrentClient();
  const slug = currentClient?.slug ?? '';
  return (
    <SharedDataProvider clientSlug={slug}>
      <AssetHouseProvider clientSlug={slug}>
        <TemplateBuilderProvider>
          <WizardShell<TemplateBuilderStepData> manifest={manifest} />
        </TemplateBuilderProvider>
      </AssetHouseProvider>
    </SharedDataProvider>
  );
}
