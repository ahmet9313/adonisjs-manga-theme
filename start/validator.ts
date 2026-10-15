import vine, { SimpleMessagesProvider } from '@vinejs/vine'

vine.messagesProvider = new SimpleMessagesProvider(
  {
    'required': '{{ field }} alanı zorunludur.',
    'string': '{{ field }} metin olmalıdır.',
    'email': 'Geçerli bir e-posta adresi girin.',
    'minLength': '{{ field }} en az {{ min }} karakter olmalıdır.',
    'maxLength': '{{ field }} en fazla {{ max }} karakter olabilir.',
    'regex': '{{ field }} biçimi geçersiz.',
    'confirmed': 'Parolalar eşleşmiyor.',
    'enum': '{{ field }} geçersiz bir değer içeriyor.',
    'number': '{{ field }} sayı olmalıdır.',
    'username.regex':
      'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi içermelidir.',
    'password.confirmed': 'Parolalar eşleşmiyor.',
  },
  {
    username: 'Kullanıcı adı',
    email: 'E-posta',
    password: 'Parola',
    current_password: 'Mevcut parola',
    login: 'Kullanıcı adı veya e-posta',
    full_name: 'Görünen ad',
    bio: 'Hakkında',
  }
)
