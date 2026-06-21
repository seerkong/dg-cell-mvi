<!--
  dg-cell-mvi-admin-template · views/login/index.vue — LoginView (the auth flow CONSUMER).

  behavior admin.auth login-flow case `login`:
    "用户在登录页提交合法凭据 → login effect 调后端成功 → token+userInfo 写入 session store(持久化) → 导航首页".

  This view binds the SHARED chassis `session` actor (from src/chassis/stores.ts) via `useChassis()`. That
  is essential for the auth guard: the token this view writes on a successful login MUST be visible to the
  navigation guard (which reads the same shared sessionStore) so the post-login redirect can pass. The
  concrete ports are injected ONCE at the app assembly root (chassis/stores.ts), not per-view.

  Assembly chain (the ports/store are assembled at the chassis root; this view just binds + renders):
    chassis  useChassis().session                  → the SHARED session actor (auth effects active)
    vue      useAdminStore(store)                   → { binding: Ref<SessionBinding>, store }
    vue      bindCommands(store, { login })          → commands.login(credentials) → store.dispatch(login(...))
    element  DgAdminOutside > DgLogin               → render; @submit → commands.login; binding → props

  Success navigation: the login effect sets token+userInfo on the SHARED actor → binding.authenticated
  flips true → we router.push the `redirect` query (set by the auth guard) or '/'.

  Mock credentials (dev): any username + password log in (see src/chassis/mockHttpPort.ts → POST /login).
-->
<template>
  <DgAdminOutside title="Admin Template" subtitle="DEPA 分层 · MVI 应用壳">
    <DgLogin
      :loading="binding.loading"
      :error="binding.error"
      :submit-text="t('login.submit', '登 录')"
      :username-placeholder="t('login.usernamePlaceholder', '请输入用户名')"
      :password-placeholder="t('login.passwordPlaceholder', '请输入密码')"
      @submit="onSubmit"
    />
  </DgAdminOutside>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

// element-plus render layer — the reusable outside shell + login form (pure UI).
import { DgAdminOutside, DgLogin } from 'dg-cell-mvi-element-plus';
// contract layer — the `login` command creator + the credentials shape.
import { login, type LoginRequest } from 'dg-cell-mvi-admin-contract';
// vue layer — the generic admin-actor binding + the event-creator → bound-dispatcher sugar (neutral).
import { useAdminStore, bindCommands } from 'dg-cell-mvi-vue';
// app chassis assembly root — the SHARED session actor (ports injected once there; same instance the
// auth guard reads). Binding the shared store is what makes the post-login token visible to the guard.
import { useChassis } from '../../chassis/stores';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// --- chassis: the SHARED session actor (auth effects already wired at the app assembly root). ---
const { session: store } = useChassis();

// --- vue: bridge the actor's viewModel → Vue Ref + bind the `login` command to a dispatcher. ---
const { binding } = useAdminStore(store);
const commands = bindCommands(store, { login });

// --- render → command: DgLogin's submit carries {username,password}; turn it into the login command. ---
function onSubmit(credentials: LoginRequest): void {
  commands.login(credentials);
}

// --- success → navigate: when the auth effect sets the token, authenticated flips true → go to the
//     redirect target (set by the auth guard as ?redirect=) or the home route. ---
watch(
  () => binding.value.authenticated,
  (authed) => {
    if (!authed) return;
    const redirect = route.query.redirect;
    const target = typeof redirect === 'string' && redirect ? redirect : '/';
    router.push(target);
  },
);
</script>
