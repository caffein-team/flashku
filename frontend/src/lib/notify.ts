import { Alert, Platform, ToastAndroid } from 'react-native';

/** Pesan singkat: toast di Android, dialog di platform lain. */
export function notify(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
