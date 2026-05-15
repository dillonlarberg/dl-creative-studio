import { Alert, Button } from '@agencypmg/alli-design-system';

interface ConfirmBannerProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmBanner({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmBannerProps) {
  return (
    <div className="mb-6">
      <Alert
        compact
        variant="warning"
        title={message}
        dismissClick={undefined}
      >
        {[
          <Button key="cancel" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>,
          <Button key="confirm" variant="caution" onClick={onConfirm}>{confirmLabel}</Button>,
        ]}
      </Alert>
    </div>
  );
}
