<!--
  dg-cell-mvi-admin-element-plus · views/login/index.vue — LoginView (the auth flow CONSUMER).

  add-admin-chassis P2·T2.2 — behavior admin.auth login-flow case `login`:
    "用户在登录页提交合法凭据 → login effect 调后端成功 → token+userInfo 写入 session store(持久化) → 导航首页".

  T2.3 change: this view now binds the SHARED chassis `session` actor (from src/chassis/stores.ts) via
  `useChassis()` instead of building its own `createSessionStore(...)`. That is essential for the auth
  guard: the token this view writes on a successful login MUST be visible to the navigation guard (which
  reads the same shared sessionStore) so the post-login redirect can pass (T2.3-AC1). A private store
  here would be invisible to the guard. The concrete ports are injected ONCE at the app assembly root
  (chassis/stores.ts), not per-view.

  Assembly chain (the ports/store are assembled at the chassis root; this view just binds + renders):

    chassis  useChassis().session                          → the SHARED session actor (auth effects active)
        │
    vue      useAdminStore(store)                          → { binding: Ref<SessionBinding>, store }
    vue      bindCommands(store, { login })                 → commands.login(credentials) → store.dispatch(login(...))
        │
    element  DgAdminOutside > DgLogin                      → render; @submit → commands.login; binding.loading/error → props

  Success navigation: the login effect sets token+userInfo on the SHARED actor → binding.authenticated
  flips true → we router.push the `redirect` query (set by the T2.3 auth guard) or '/'. We only react to
  the authenticated fact (the guard does the gating). No new vue composable: the generic useAdminStore +
  bindCommands (T1.4) already cover this, and adding one would couple dg-cell-mvi-vue to the admin schema
  (decisions §8 — keep the vue package neutral).
-->
<template>
  <DgAdminOutside title="dg-cell-mvi Admin" subtitle="DEPA 分层 · MVI 应用壳">
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
// vue-i18n reactive translate — localizes the login chrome (button + placeholders) so it switches with
// the app language (P6·T6.1). The login page lives outside the layout, so the switch isn't reachable here,
// but a locale chosen before logout (or hydrated by T6.2) is reflected on this page.
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
//     redirect target (set by the T2.3 guard as ?redirect=) or the home route. ---
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
