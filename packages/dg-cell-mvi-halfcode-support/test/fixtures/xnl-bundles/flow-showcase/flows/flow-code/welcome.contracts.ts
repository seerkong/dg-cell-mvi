export interface WelcomeCtrlInput {
  name?: string;
}

export interface WelcomeCtrlOutput {
  message: string;
}

export interface WelcomeWorkInput {
  requestId?: string;
}

export interface WelcomeWorkOutput {
  status: 'completed';
}

export interface WelcomeBizInput {
  requestId?: string;
}

export interface WelcomeBizOutput {
  status: 'completed';
}
