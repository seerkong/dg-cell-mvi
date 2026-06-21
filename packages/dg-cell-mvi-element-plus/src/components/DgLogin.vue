<!--
  dg-cell-mvi-element-plus · DgLogin — the username/password login form (PURE UI).

  A reusable Element-Plus login card body (add-admin-chassis P2·T2.2 / behavior admin.auth login-flow).
  It renders an `el-form` with a username + password field, an optional title/subtitle, an inline error
  alert, and a (loading-aware) submit button. ENTER in either field submits.

  It is PURE UI — it owns NO store, NO contract, NO router (decisions §8 — element-plus render layer must
  not depend on admin-logic / admin-contract). All data flows through props/events:
    in  : `title` / `subtitle` / `loading` / `error`  (the consumer feeds these from a SessionBinding).
    out : `submit({ username, password })`             (the consumer dispatches the login command).
  The two input fields are LOCAL transient view state (7-级 surface input, design §A) — they live in
  component refs here and leave only via the `submit` event; nothing is written back into them.
-->
<template>
  <el-form :class="$style.login" label-position="top" @submit.prevent="onSubmit">
    <div v-if="title || subtitle" :class="$style.head">
      <div v-if="title" :class="$style.title">{{ title }}</div>
      <div v-if="subtitle" :class="$style.subtitle">{{ subtitle }}</div>
    </div>

    <!-- error surface: the consumer passes the SessionBinding.error string (‘’ = none). -->
    <el-alert
      v-if="error"
      :class="$style.error"
      type="error"
      :title="error"
      :closable="false"
      show-icon
    />

    <el-form-item :class="$style.item">
      <el-input
        v-model="username"
        size="large"
        :placeholder="usernamePlaceholder || '请输入用户名'"
        autocomplete="username"
        :prefix-icon="UserIcon"
        @keyup.enter="onSubmit"
      />
    </el-form-item>

    <el-form-item :class="$style.item">
      <el-input
        v-model="password"
        type="password"
        size="large"
        :placeholder="passwordPlaceholder || '请输入密码'"
        autocomplete="current-password"
        show-password
        :prefix-icon="LockIcon"
        @keyup.enter="onSubmit"
      />
    </el-form-item>

    <el-form-item :class="$style.item">
      <el-button
        type="primary"
        size="large"
        :class="$style.button"
        :loading="loading"
        native-type="submit"
        @click="onSubmit"
      >
        {{ submitText || '登录' }}
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Lock as LockIcon, User as UserIcon } from '@element-plus/icons-vue';

/**
 * Props (all optional — PURE UI, every label is an override so the consumer can localize it; defaults stay
 * the original Chinese so existing callers are behavior-equivalent. P6·T6.1 added the placeholder props so
 * the login page can switch language end-to-end via i18n).
 *   - title               : heading shown above the fields.
 *   - subtitle            : muted line under the title.
 *   - loading             : true while the auth effect is in flight → button spins + disables (SessionBinding.loading).
 *   - error               : last auth error message ('' = none) → inline el-alert (SessionBinding.error).
 *   - submitText          : button label (default '登录').
 *   - usernamePlaceholder : username input placeholder (default '请输入用户名').
 *   - passwordPlaceholder : password input placeholder (default '请输入密码').
 * Emits:
 *   - submit({ username, password }) : the consumer turns this into the `login` command.
 */
defineProps<{
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string;
  submitText?: string;
  usernamePlaceholder?: string;
  passwordPlaceholder?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', credentials: { username: string; password: string }): void;
}>();

// LOCAL transient view input (leaves only via the `submit` event; never written back).
const username = ref('');
const password = ref('');

function onSubmit(): void {
  emit('submit', { username: username.value, password: password.value });
}
</script>

<style module>
.login {
  width: 100%;
}
.head {
  text-align: center;
  margin-bottom: 20px;
}
.title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}
.subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}
.error {
  margin-bottom: 16px;
}
.item {
  margin-bottom: 20px;
}
.button {
  width: 100%;
}
</style>
