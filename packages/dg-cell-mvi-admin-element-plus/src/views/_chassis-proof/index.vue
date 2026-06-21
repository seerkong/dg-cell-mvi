<!--
  dg-cell-mvi-admin-element-plus · views/_chassis-proof/index.vue — SessionProof.

  The DEPA layered end-to-end PROOF (add-admin-chassis P1·T1.4 / AC1): one data-ownership actor
  (`session`) wired through every chassis layer, rendered in Element Plus, responding to commands.

  T2.4 change: this page now binds the SHARED chassis `session` actor (chassis/stores.ts) via
  `useChassis()` instead of building its own private `createSessionStore()`. Two reasons:
    1. it now shows the REAL session — after a mock login the token/userInfo set by the LoginView are
       the SAME fact this page reads (single source of auth truth);
    2. it hosts the minimal LOGOUT entry (P4 builds the real header): the "退出登录" button dispatches the
       `logout` command on the shared actor → clears the session + token shadow → the nav guard then bounces
       any protected route back to /login (behavior admin.auth case `logout`). A private store here could
       not affect the guard, so binding the shared store is required for the logout verification.

  Assembly chain (the ports/store are assembled at the chassis root; this view binds + renders + commands):

    chassis  useChassis().session                       → the SHARED session actor (auth effects active; mock/axios HttpPort + localStorage StoragePort injected once at the root)
        │
    contract (dg-cell-mvi-admin-contract)  setToken / clearSession / logout event creators + SessionBinding VM
        │
    vue      (dg-cell-mvi-vue)             useAdminStore(store) + bindCommands(store, { logout })  → { binding: Ref<VM>, dispatch }
        │
    element  (element-plus)                 el-card / el-descriptions / el-tag / el-input / el-button render `binding`,
                                            buttons dispatch commands → viewModel updates → re-render (responds to commands)
-->
<template>
  <div :class="$style.wrap">
    <el-alert
      type="info"
      :closable="false"
      title="DEPA 分层端到端打通证明 (P1·T1.4 / P2·T2.4 共享会话)"
      description="绑定共享 session actor：登录后这里显示真实 token/userInfo；可用「退出登录」清会话（守卫将拦截受保护路由）。链路：chassis → contract → logic(session actor + auth effects) → support(HttpPort/StoragePort 注入) → vue(useAdminStore) → element-plus 渲染并响应命令"
      show-icon
    />

    <el-card :class="$style.card" shadow="never">
      <template #header>
        <div :class="$style.cardHeader">
          <span>session actor · viewModel</span>
          <el-tag :type="binding.authenticated ? 'success' : 'info'" size="small">
            {{ binding.authenticated ? 'authenticated' : 'anonymous' }}
          </el-tag>
        </div>
      </template>

      <!-- read side: el renders the live viewModel (Vue Ref bridged from the depa graph signal) -->
      <el-descriptions :column="1" border>
        <el-descriptions-item label="token">
          <el-tag v-if="binding.token" type="success" disable-transitions>{{ binding.token }}</el-tag>
          <span v-else :class="$style.muted">（空）</span>
        </el-descriptions-item>
        <el-descriptions-item label="userInfo">
          <code v-if="binding.userInfo">{{ JSON.stringify(binding.userInfo) }}</code>
          <span v-else :class="$style.muted">（空）</span>
        </el-descriptions-item>
        <el-descriptions-item label="authenticated">
          <code>{{ binding.authenticated }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="status">
          <code>{{ binding.status }}</code>
        </el-descriptions-item>
      </el-descriptions>

      <!-- write side: el inputs dispatch the contract's commands → reduce → viewModel → re-render -->
      <div :class="$style.controls">
        <el-input
          v-model="draftToken"
          placeholder="输入 token"
          :class="$style.input"
          @keyup.enter="onSetToken"
        />
        <el-button type="primary" @click="onSetToken">设置 Token</el-button>
        <el-button @click="onSetUser">设置用户</el-button>
        <el-button plain @click="onClear">清除会话(本地)</el-button>
        <!-- the REAL logout command: clears the shared session + token shadow → guard bounces protected routes. -->
        <el-button type="danger" data-test="logout" @click="onLogout">退出登录</el-button>
        <!-- DEV 401 trigger: hit the chassis HttpPort's /debug/401 → onUnauthorized → logout (same path a
             real backend 401 takes). Lets 401→自动登出 be browser-verified without a server. -->
        <el-button type="warning" plain data-test="simulate-401" @click="onSimulate401">
          模拟 401（触发自动登出）
        </el-button>
      </div>
    </el-card>

    <!-- v-permission directive demo (T5.2/T5.3): the element-level permission gate, observable here on an
         always-reachable page. The directive (registered in main.ts, bound to the permission actor's live
         codes) REMOVES an element whose code the user lacks. After login the dev mock grants `user:view`
         but withholds `system:admin`, so the first button stays and the second is gone from the DOM —
         delta admin.rbac "无权则移除元素". (`.hide` toggles display instead of removing.) -->
    <el-card :class="$style.card" shadow="never">
      <template #header>
        <span>v-permission 指令演示（元素级权限）</span>
      </template>
      <div :class="$style.controls">
        <!-- HELD code (user:view 在 demo 码内) → this button is PRESENT after login. -->
        <el-button v-permission="'user:view'" type="success" plain data-test="vperm-granted">
          需要 user:view（持有 → 显示）
        </el-button>
        <!-- WITHHELD code (system:admin 不在 demo 码内) → this button is REMOVED from the DOM after login. -->
        <el-button v-permission="'system:admin'" type="danger" plain data-test="vperm-denied">
          需要 system:admin（无权 → 移除）
        </el-button>
      </div>
      <p :class="$style.muted">
        登录后：左侧（user:view，持有）保留，右侧（system:admin，无权）从 DOM 移除。
      </p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

// contract layer — the actor's command vocabulary (event creators) + the viewModel shape.
import { setToken, setUserInfo, clearSession, logout } from 'dg-cell-mvi-admin-contract';
// vue layer — the generic admin-actor → reactive binding composable + command-binding sugar (T1.4).
import { useAdminStore, bindCommands } from 'dg-cell-mvi-vue';
// app chassis assembly root — the SHARED session actor (ports injected once there; same instance the
// LoginView writes and the nav guard reads). Binding it makes this page show the real session + lets
// its logout actually trip the guard. `chassis.http` is the same shared transport the crud pages use —
// the "模拟 401" button calls its /debug/401 to drive the real onUnauthorized→logout path.
import { useChassis, chassis } from '../../chassis/stores';
import { DEBUG_UNAUTHORIZED_URL } from '../../chassis/mockHttpPort';

const router = useRouter();

// --- chassis: the SHARED session actor (auth effects active; HttpPort/StoragePort injected at the root). ---
const { session: store } = useChassis();

// --- vue: bridge the actor's viewModel signal → Vue Ref + bound dispatch (THE useGraphSignal bridge). ---
const { binding, dispatch } = useAdminStore(store);
// bind the `logout` command (login command lives in the LoginView; here we only need logout).
const commands = bindCommands(store, { logout });

// --- write side: each handler dispatches a contract command; the el view re-renders off `binding`. ---
const draftToken = ref('');
function onSetToken() {
  dispatch(setToken(draftToken.value || `jwt-${Date.now()}`));
}
function onSetUser() {
  dispatch(setUserInfo({ id: 1, username: 'alice', nickname: '管理员' }));
}
function onClear() {
  // a raw fact-clear (no logout effect) — handy for poking the state machine; does NOT navigate.
  dispatch(clearSession());
  draftToken.value = '';
}
// the real logout: dispatch the command (an ASYNC effect that calls storage.remove + dispatches
// clearSession + publishes loggedOut). Navigate REACTIVELY when the session actually clears — pushing
// /login eagerly would race the effect (the /login guard would still see a token and bounce back to /).
// (mirrors LoginView's authenticated watch.) behavior admin.auth case `logout`: "清会话…导航回登录页".
watch(
  () => binding.value.authenticated,
  (authed) => {
    if (!authed) router.push('/login');
  },
);
function onLogout() {
  commands.logout();
}
// DEV verification trigger for the P3 Gate "401 → 自动 logout". Fire a request at the chassis HttpPort's
// /debug/401 endpoint: the port (mock in dev; axios against a real backend) runs its 401 handling →
// onUnauthorized → dispatch(logout()) → session clears → the `authenticated` watch above pushes /login,
// and the nav guard then bounces any protected route. The request itself rejects by design (it's an auth
// failure), so we swallow it — the logout side effect, not the response, is the observable behavior.
async function onSimulate401() {
  try {
    await chassis.http.request({ url: DEBUG_UNAUTHORIZED_URL });
  } catch {
    // expected: a 401 rejects. The onUnauthorized→logout side effect already fired inside the port.
  }
}
</script>

<style module>
.wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}
.card {
  width: 100%;
}
.cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.input {
  width: 240px;
}
.muted {
  color: var(--dg-text-muted, #909399);
}
</style>
