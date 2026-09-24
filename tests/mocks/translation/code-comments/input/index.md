# Комментарии в блоках кода

Комментарии переводятся, код и отступы остаются как есть.

```yaml
# Клиентская часть
bus_client:
  encryption_mode: required # обязательное шифрование
  # verification_mode: full
  color: "#fff3e0"

# Серверная часть
bus_server:
  ca:
    file_name: /etc/yt/certs/ca.pem
```

```python
# Загружаем конфиг
config = load()  # из файла
# print(config)
```

```ts
// Настройки клиента
const url = 'https://example.com'; // адрес сервера
// const retries = 3;
```

```sql
-- Выбираем всех пользователей
SELECT * FROM users; -- без фильтра
-- SELECT * FROM admins;
```

```bash
# Клиентская часть
export TOKEN=<ваш токен> # подсказка
# export TOKEN=<старый токен>
```

- Пункт списка

  ```yaml
  # Комментарий в списке
  key: value
  ```

```text
# Не комментарий: язык без известного синтаксиса
value: <значение>
```
