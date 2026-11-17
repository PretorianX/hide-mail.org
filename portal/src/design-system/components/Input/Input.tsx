import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';
import styled, { css } from 'styled-components';
import { adaptiveColor } from '../../theme/helpers';

export type InputVariant = 'default' | 'error';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  helperText?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  prefix?: string;
  suffix?: ReactNode;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
`;

const Label = styled.label`
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  font-weight: ${({ theme }) => theme.typography.fontWeight.medium};
  color: ${({ theme }) => theme.colors.text.primary};
`;

const InputRow = styled.div<{ $variant: InputVariant; $focused?: boolean }>`
  display: flex;
  align-items: center;
  height: 44px;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 1px solid;
  background: ${({ theme }) => theme.colors.surface};
  transition: all 0.2s ease;
  overflow: hidden;

  ${({ $variant, theme }) =>
    $variant === 'error'
      ? css`
          border-color: ${theme.colors.error};
          box-shadow: 0 0 0 3px ${theme.colors.error}12;
        `
      : css`
          border-color: ${theme.colors.border};

          &:hover {
            border-color: ${adaptiveColor(
              theme,
              theme.colors.text.disabled,
              'rgba(255, 255, 255, 0.28)',
            )};
          }

          &:focus-within {
            border-color: ${theme.colors.primary};
            box-shadow: 0 0 0 3px ${theme.colors.primaryLight};
          }
        `}
`;

const Addon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 12px;
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: ${({ theme }) =>
    adaptiveColor(theme, theme.colors.background, 'rgba(255, 255, 255, 0.04)')};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  white-space: nowrap;
  user-select: none;
  flex-shrink: 0;
`;

const SuffixAddon = styled(Addon)`
  border-right: none;
  border-left: 1px solid ${({ theme }) => theme.colors.border};
`;

const IconSlot = styled.span<{ $position: 'leading' | 'trailing' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.text.disabled};

  ${({ $position }) =>
    $position === 'leading'
      ? css`padding-left: 12px;`
      : css`padding-right: 12px;`}

  & > svg {
    width: 18px;
    height: 18px;
  }
`;

const StyledInput = styled.input`
  flex: 1;
  height: 100%;
  min-width: 0;
  padding: 0 14px;
  border: none;
  outline: none;
  background: transparent;
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize.md};
  color: ${({ theme }) => theme.colors.text.primary};
  line-height: 1;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.disabled};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const HelperText = styled.span<{ $variant: InputVariant }>`
  font-family: ${({ theme }) => theme.typography.fontFamily.sans};
  font-size: ${({ theme }) => theme.typography.fontSize.xs};
  color: ${({ theme, $variant }) =>
    $variant === 'error' ? theme.colors.error : theme.colors.text.secondary};
`;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      label,
      helperText,
      leadingIcon,
      trailingIcon,
      prefix,
      suffix,
      id,
      ...props
    },
    ref,
  ) => {
    return (
      <Wrapper>
        {label && <Label htmlFor={id}>{label}</Label>}
        <InputRow $variant={variant}>
          {prefix && <Addon>{prefix}</Addon>}
          {leadingIcon && <IconSlot $position="leading">{leadingIcon}</IconSlot>}
          <StyledInput ref={ref} id={id} {...props} />
          {trailingIcon && <IconSlot $position="trailing">{trailingIcon}</IconSlot>}
          {suffix && <SuffixAddon>{suffix}</SuffixAddon>}
        </InputRow>
        {helperText && (
          <HelperText $variant={variant}>{helperText}</HelperText>
        )}
      </Wrapper>
    );
  },
);

Input.displayName = 'Input';
