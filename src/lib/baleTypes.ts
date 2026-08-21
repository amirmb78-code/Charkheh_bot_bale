export interface BaleUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface BaleChat {
  id: number;
  type?: string;
}

export interface BalePhotoSize {
  file_id: string;
  width?: number;
  height?: number;
}

export interface BaleDocument {
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

export interface BaleLocation {
  latitude: number;
  longitude: number;
}

export interface BaleContact {
  phone_number: string;
  first_name?: string;
  last_name?: string;
  user_id?: number;
}

export interface BaleMessage {
  message_id: number;
  from?: BaleUser;
  chat: BaleChat;
  text?: string;
  photo?: BalePhotoSize[];
  document?: BaleDocument;
  location?: BaleLocation;
  contact?: BaleContact;
}

export interface BaleCallbackQuery {
  id: string;
  from: BaleUser;
  message?: BaleMessage;
  data?: string;
}

export interface BaleUpdate {
  update_id: number;
  message?: BaleMessage;
  edited_message?: BaleMessage;
  callback_query?: BaleCallbackQuery;
}
