# التثبيت — D_AI 0.1

هذه صفحة عملية للتثبيت على جهاز واحد. تثبيت مُعرَّف ببيانات المستخدم
(`~/.d-ai`) منفصل تماماً عن شجرة المصدر.

## 1. المتطلبات

| المتطلب | الإصدار | لماذا |
|---|---|---|
| Python | 3.11 أو أحدث | `from __future__ import annotations`، `datetime.fromisoformat`، و`asyncio` في الوصلات |
| نظام ملفات يدعم صلاحيات Unix | Linux أو macOS | النواة ترفض العمل على مجلد بيانات بصلاحيات مفتوحة |
| Node.js | 20 أو أحدث | مُشغّل اختبار الراوتر فقط (`node --test`) |
| OpenCode | v2.0.27 أو أحدث | المضيف المرجعي للوكلاء والمهارات والأوامر |

للتحقق:

```bash
python3 --version && node --version
```

## 2. تثبيت النواة

```bash
git clone <repo> D_AI && cd D_AI
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .
```

الاعتمادية الإلزامية الوحيدة هي `cryptography` (مشفّرات AES-GCM). اعتماديات
MCP اختيارية:

```bash
.venv/bin/pip install -e ".[mcp]"
```

## 3. تهيئة بيانات المستخدم

بيانات المستخدم **خارج شجرة المستودع** ولا تُنشر. افتراضياً `~/.d-ai`.

```bash
.venv/bin/dai init
```

ينشئ `init` مجلد البيانات بصلاحيات `0700` ومفتاح التثبيت وملفات القاعدة
الثلاثة. تحقّق:

```bash
.venv/bin/dai status
```

إن أردت جذراً آخر:

```bash
.venv/bin/dai --data-root /media/secure/d-ai status
```

## 4. ربط الوصلات بالمضيف

### OpenCode

```bash
python scripts/install_opencode.py --target ~/.config/opencode --dry-run
python scripts/install_opencode.py --target ~/.config/opencode
```

يعرض `--dry-run` ما سيُنشأ أو يُستبدَل قبل التنفيذ. يثبّت:

- تعريفات الوكلاء (المديرون العشرة والمتخصصون) إلى `agent/`
- المهارات إلى `skill/`
- الأوامر إلى `command/`
- خادم MCP باسم `dai` إلى `opencode.jsonc`

ثم افتح OpenCode داخل مجلد عملك. تحقّق من التحميل:

```bash
node scripts/check_host.mjs --target ~/.config/opencode
```

### pi

```bash
python adapters/pi/probe.py
```

يطبع حالة `pi` الحقيقية. إن لم يكن مثبّتاً يذكر ذلك صراحة ولا يفترض شيئاً.
الوصلة نصّ عقد لا مُشغّل: انظر [adapters/pi/README.md](adapters/pi/README.md).

## 5. التحقق من التثبيت

```bash
# اختبارات النواة
PYTHONPATH=src python -m unittest discover -s tests

# اختبارات الراوتر (إن نُسخ إلى ~/Projects/D_AI)
node --test tests/router.test.mjs

# فحص شامل: البنية، والصلاحيات، والتبعيات
python scripts/verify_install.py --data-root ~/.d-ai
```

`scripts/verify_install.py` يفحص: بنية الشجرة، صلاحيات مجلد البيانات، عدم
وجود أسرار في الشجرة، تطابق نسخة `skills-lock.json` إن وُجدت، وقدرة كل
وحدة على الاستيراد. يطبع JSON واحداً ويخرج بصفر فقط إذا لم يجد خللاً.

## 6. الترقية

المصدر هو المرجع الوحيد. الترقية:

```bash
git -C /path/to/D_AI pull
cd /path/to/D_AI && .venv/bin/pip install -e .
.venv/bin/dai status
```

بيانات المستخدم لا تُمسّ بالترقية. إن غيّرت نسخة المخطط في الأساس، refuses to
start until the matching migration ran — the core never silently migrates.

## 7. النسخ الاحتياطي والاستعادة

```bash
dai backup create /secure/place/dai-snapshot      # لا يحتوي على المفاتيح
dai backup restore /secure/place/dai-snapshot      # يطلب تأكيداً محلياً
```

النسخة تحتوي قواعد البيانات فقط. **استعادتها تتطلّب نفس مفاتيح التثبيت
الحية**؛ نسخة من تثبيت آخر تُرفض. Records التي مُحيت نهائياً لا تعود مع أي
نسخة.

## 8. التراجع عن التثبيت

```bash
python scripts/install_opencode.py --target ~/.config/opencode --rollback manifest.json
```

يحذف ما أضافه المثبّت ولا يمسّ ما كان موجوداً قبله. بيانات المستخدم في
`~/.d-ai` لا تُحذف بالتراجع — احذفها بنفسك إن أردت.

## 9. الترقية من مستودع خارجي

إن أعطاك المالك مستودعاً على GitHub لتبنيّه داخل النظام:

```bash
dai component propose --project my-project \
  --source https://github.com/owner/repo \
  --pattern "المهمة → playbook محدد بخطوات قابلة للفحص" \
  --pattern "سجل قرارات يربط كل playbook بمصدره"
dai component decide --project my-project <component-id> \
  --decision ADOPT_PATTERN --rationale "..."
dai component adopt --project my-project <component-id> \
  --capability-id "workflow.playbook" \
  --bindings workflow.step --files src/dai/charters.py \
  --verification "gaps() يقبل العقد الناتج"
```

السجل **لا ينسخ المستودع ولا يضيفه اعتمادية**: يوثّق ما استُوعب وأين، ويقيس
أثره. راجع [docs/components/EXTERNAL_REPO_ADOPTION_REVIEW_AR.md](docs/components/EXTERNAL_REPO_ADOPTION_REVIEW_AR.md)
للاطّلاع على ما سبق فحصه.

## 10. أخطاء شائعة

| العَرَض | السبب | الحل |
|---|---|---|
| `Private state requires Unix permissions` | مجلد البيانات بصلاحيات مفتوحة | `chmod 700 ~/.d-ai` |
| `A trusted principal is required` | استُدعيت خدمة بلا هوية موثوقة | استخدم `dai` CLI أو مُشغّل MCP بمetadata جلسة أصلي |
| `The scoped capability was not granted` | الدور لا يملك القدرة | المالك يمنحها عبر `MemoryStore.grant` |
| `Record was permanently purged` | مُحيت النسخة نهائياً | لا استرجع بالمفتاح؛ المحو غير قابل للعكس |
| `Snapshot does not belong to this live key authority` | نسخة من تثبيت آخر | استخدم مفاتيح التثبيت نفسها |
