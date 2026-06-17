import { Drawer } from '@agencypmg/alli-design-system';
import { Button } from '@agencypmg/alli-design-system';
import type { ClientAssetHouse } from '../../services/clientAssetHouse';
import { BrandKitPanel } from './BrandKitPanel';

interface BrandKitDrawerProps {
  open: boolean;
  onClose: () => void;
  clientSlug: string;
  assetHouse?: ClientAssetHouse | null;
  isLoading?: boolean;
  error?: string | null;
}

export function BrandKitDrawer({
  open,
  onClose,
  clientSlug,
  assetHouse,
  isLoading,
  error,
}: BrandKitDrawerProps) {
  const footer = (
    <Button
      variant="text"
      as="a"
      href={`/adlabs/${clientSlug}/brand-standards`}
      target="_blank"
      rel="noopener"
      onClick={onClose}
    >
      Edit in Brand Kit ↗
    </Button>
  );

  return (
    <Drawer
      isOpen={open}
      onClose={onClose}
      header="Brand Kit"
      footer={footer}
      closeIcon
      maskClosable
    >
      <BrandKitPanel
        assetHouse={assetHouse}
        isLoading={isLoading}
        error={error}
        clientSlug={clientSlug}
        showVariables
        onEdit={() => {
          window.open(`/adlabs/${clientSlug}/brand-standards`, '_blank');
        }}
      />
    </Drawer>
  );
}
