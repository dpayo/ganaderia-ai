import { Alert, type AlertButton, Platform } from 'react-native';

/**
 * Alert.alert no hace nada en la versión web; aquí se usa window.alert/confirm.
 * Con botones: el botón "cancel" se asocia a Cancelar y el primero que no lo es a Aceptar.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const main = actions[actions.length - 1]!;
  const hint = buttons && buttons.length > 1 ? `\n\nAceptar = ${main.text}` : '';
  if (window.confirm(text + hint)) main.onPress?.();
  else buttons?.find((b) => b.style === 'cancel')?.onPress?.();
}
