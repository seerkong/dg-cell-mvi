<template>
  <DgCrud :crud-binding="crudBinding" :commands="commands" />
</template>

<script setup lang="ts">
import { DgCrud, useCrud, type CrudTranslator } from 'dg-cell-mvi-element-plus';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { EN_MESSAGES } from './messages';

const props = defineProps<{ locale: 'zh' | 'en' }>();

// the injected translator. 'en' resolves against EN_MESSAGES; a miss returns the key so the framework
// recovers its default Chinese. 'zh' always returns the key → every built-in label falls back to its
// default Chinese (behavior-equivalent to NOT injecting a translator). Locale captured at mount; the
// parent remounts (via :key) on toggle.
const translator: CrudTranslator = (key, fallback) => {
  if (props.locale === 'en') return EN_MESSAGES[key] ?? fallback ?? key;
  return fallback ?? key;
};

const { crudBinding, commands } = useCrud({ createCrudOptions, commonOptions, i18n: translator });
</script>
