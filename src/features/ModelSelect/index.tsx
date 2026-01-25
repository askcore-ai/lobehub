import { LobeSelect, type LobeSelectProps, TooltipGroup } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { type ComponentProps, type ReactNode, memo, useMemo } from 'react';

import { ModelItemRender, ProviderItemRender } from '@/components/ModelSelect';
import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';
import { type EnabledProviderWithModels } from '@/types/aiProvider';

const styles = createStaticStyles(({ css }) => ({
  popup: css`
    width: max(360px, var(--anchor-width));
  `,
}));

type ModelAbilities = EnabledProviderWithModels['children'][number]['abilities'];

interface ModelOption {
  abilities?: ModelAbilities;
  displayName?: string;
  id: string;
  label: ReactNode;
  provider: string;
  value: string;
}

type ModelItemRenderProps = ComponentProps<typeof ModelItemRender>;

interface ModelSelectProps extends Pick<LobeSelectProps, 'loading' | 'size' | 'style' | 'variant'> {
  defaultValue?: { model: string; provider?: string };
  initialWidth?: boolean;
  onChange?: (props: { model: string; provider: string }) => void;
  requiredAbilities?: (keyof EnabledProviderWithModels['children'][number]['abilities'])[];
  showAbility?: boolean;

  value?: { model: string; provider?: string };
}

const ModelSelect = memo<ModelSelectProps>(
  ({
    value,
    onChange,
    initialWidth = false,
    showAbility = true,
    requiredAbilities,
    loading,
    size,
    style,
    variant,
  }) => {
    const enabledList = useEnabledChatModels();

    const options = useMemo<LobeSelectProps['options']>(() => {
      const getChatModels = (provider: EnabledProviderWithModels) => {
        const models =
          requiredAbilities && requiredAbilities.length > 0
            ? provider.children.filter((model) =>
                requiredAbilities.every((ability) => Boolean(model.abilities?.[ability])),
              )
            : provider.children;

        return models.map((model) => ({
          ...model,
          label: <ModelItemRender {...model} showInfoTag={false} />,
          provider: provider.id,
          value: `${provider.id}/${model.id}`,
        }));
      };

      if (enabledList.length === 1) {
        const provider = enabledList[0];

        return getChatModels(provider);
      }

      return enabledList
        .map((provider) => {
          const opts = getChatModels(provider);
          if (opts.length === 0) return undefined;

          return {
            label: (
              <ProviderItemRender
                logo={provider.logo}
                name={provider.name}
                provider={provider.id}
                source={provider.source}
              />
            ),
            options: opts,
          };
        })
        .filter(Boolean) as LobeSelectProps['options'];
    }, [enabledList, requiredAbilities, showAbility]);

    return (
      <TooltipGroup>
        <LobeSelect
          defaultValue={`${value?.provider}/${value?.model}`}
          loading={loading}
          onChange={(value, option) => {
            if (!value) return;
            const model = (value as string).split('/').slice(1).join('/');
            onChange?.({ model, provider: (option as unknown as ModelOption).provider });
          }}
          optionRender={(option) =>
            (() => {
              const raw = (option as unknown as { data?: unknown }).data ?? option;
              const data = raw as Record<string, unknown> | undefined;
              if (!data || typeof data.id !== 'string') return null;

              const rest = { ...data } as Record<string, unknown>;
              delete rest.label;
              delete rest.provider;
              delete rest.value;

              return <ModelItemRender {...(rest as unknown as ModelItemRenderProps)} showInfoTag />;
            })()
          }
          options={options}
          popupClassName={styles.popup}
          popupMatchSelectWidth={false}
          selectedIndicatorVariant="bold"
          size={size}
          style={{
            minWidth: 200,
            width: initialWidth ? 'initial' : undefined,
            ...style,
          }}
          value={`${value?.provider}/${value?.model}`}
          variant={variant}
          virtual
        />
      </TooltipGroup>
    );
  },
);

export default ModelSelect;
