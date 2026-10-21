# D_AI — النظام المركزي للذكاء الاصطناعي العميق

> **حالة المستودع:** إصدار **1.0.0**. النواة (memory, charters, tasks, decisions,
> teams, models, tools, components, updates) منفَّذة ومغطّاة بـ **184 اختبار وحدة
> يمرّ**. مواصفات الأنظمة العشرة مكتوبة. **ما لم يُثبت بعد:** التحقّق المهني
> لكل فرع تخصّصي، واختبار الأسطح الأربعة (OpenCode CLI / OpenCode Desktop /
> pi CLI / PI-Desktop) على نسخ مثبتة. اقرأ [docs/IMPLEMENTATION_STATE.md](docs/IMPLEMENTATION_STATE.md)
> قبل أن تعتمد على أي قدرة.

D_AI منظومة **محلية** تحتفظ بمعرفة العمل وقراراته، تقود استكمال طلبك، وتنسق
تخصصات وأدوات ومهارات حتى مخرجات عميقة **قابلة للفحص**. ليست نموذجاً آخر،
وليست واجهة مجرّداً: هي طبقة حالة وسياسة فوق مضيفي النماذج الأصليين.

## ما الذي يميّزه

| الميزة | كيف تعمل |
|---|---|
| **ذاكرة مشفّرة بثلاثة نطاقات** | `person.db` و`project.db` و`global.db`، كل سجل بمفتاح AES-GCM خاص به. المسح المؤقت يستأصل المفتاح فتستحيل الاستعادة من أي نسخة قاعدة بيانات. |
| **عقد تأسيس مُصدَّر** | لا يبدأ عمل بلا هدف ومخرج ومعيار قبول وموازنة صراحة. الفجوات تُعرض ولا تُملأ بالافتراض. |
| **مخطط مهام دائماً** | 17 حالة، حجز حصري للملكية، و`COMPLETED` لا يُبلغ عنه إلا عبر محاولة ناجحة موثّقة. |
| **قرارات مُصدَّرة** | القرار يُسجَّل بنصه ومصدر تفويضه؛ وتحديثُه يبطل النسخة السابقة ويؤثر على الوحدات المرتبطة. |
| **فريق بثلاث طبقات** | وكلاء بهويات مستقلة وملكية حصرية للعمل، ورسائل تُرسل ولا تُطبَّق بلا قرار. |
| **توجيه صادق للتكلفة** | التكلفة المجهولة **ليست صفراً**، والاشتراك ليس طلباً بلا حد. لا تصعيد صامت إلى نموذج مدفوع. |
| **بوابة أدوات** | القرار عляется؛ هوية النظام وحدها لا تحجب أداة، وكل منع يُنسب إلى مصدره. |
| **تبنّي مستودعات خارجية** | تستقبل D_AI **تعليمات** المستودع وطريقة عمله وتدمجها في عقودها — ولا تنسخ المستودع ولا تجعله اعتمادية. |

## التشغيل السريع

```bash
git clone <repo> D_AI && cd D_AI
python3 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/dai --data-root ~/.d-ai init
.venv/bin/dai --data-root ~/.d-ai project create "مشروعي" --id my-project
```

الشرح الكامل في [INSTALL.md](INSTALL.md) و[docs/MAP_AR.md](docs/MAP_AR.md).

### داخل المضيف (OpenCode)

```bash
# اربط تعريفات الوكلاء والمهارات والأوامر بمضيف OpenCode
python scripts/install_opencode.py --target ~/.config/opencode --dry-run
python scripts/install_opencode.py --target ~/.config/opencode
```

ثم افتح OpenCode على مجلد عملك واختر نظاماً: `/research` `/innovate` `/learn`
`/invest` `/assistant` `/consult` `/investigate` `/cyber` `/strategy`
`/plan-task`.

## بنية المستودع

```
src/dai/          النواة المحايدة عن المضيف: عقود، ذاكرة، مهام، قرارات، فريق، نماذج، أدوات، مكونات، تحديثات
adapters/         وصلات المضيفين: opencode/ (وكلاء، مهارات، أوامر، راوتر، خادم MCP) و pi/
systems/          مواصفات الأنظمة العشرة: الأدوار، المناهج، الفروع، الحالات المضادة، بوابات القبول
packs/            حزم القدرات: مصدرها، نسختها المثبّتة، ترخيصها، حالة مراجعتها
config/           مخططات وقيم عامة بلا أسرار
scripts/          تثبيت تعريفات المضيف، وفحص التثبيت
tests/            عقود النواة، الوصلات، الاستمرارية
docs/             المواصفات، القرارات، الأدلة، الأدلة القابلة للنشر
```

## أوامر التشغيل

```bash
dai status                                   # حالة التثبيت
dai project list                             # مشاريعك
dai --data-root ~/.d-ai memory list --project my-project
dai charter propose --project my-project --json charter.json
dai charter assess --project my-project <draft-id>
dai task create --project my-project --objective "..." --acceptance "..."
dai decision record --project my-project --text "..." --meaning "..." --authorization-source "..."
dai model route --project my-project --task-class retrieval
dai component propose --project my-project --source https://github.com/owner/repo --pattern "..."
```

المحو النهائي والاستعادة يتطلّبان تأكيداً محلياً تفاعلياً — لا يمكن لبرمجة
ملفات أو وكيل تنفيذهما.

## ما لا تفعله D_AI

- لا تُشغّل نماذج بنفسها: **المضيف هو من يدير حلقة النماذج**.
- لا ترسل بريداً ولا تتداول ولا توقّع ولا تنشر ولا تفحص أمنياً خارجياً
  بلا تفويض صريح.
- لا تفترض أن ملفاً أو رابطاً أو مهارة خارجية يمنحها صلاحية. **المصدر نصّ
  ليس تفويضاً**؛ التفويض يأتي من المالك عبر عقد صريح.
- لا تُعلن جودة مهنية: تسمية النظام `CONFIGURED` تعني أن البنية موجودة، لا
  أن المجال مُختبَر مهنياً.

## الرخصة

**GPL-3.0-or-later** — النص الكامل في [LICENSE](LICENSE). مكوّنات الطرف الثالث
ورخصها ونسبها موثّقة في [THIRD_PARTY.md](THIRD_PARTY.md).

## المساهمة

كل مساهمة خارجية تمر بمراجعة المالك قبل الدمج — التفاصيل في
[CONTRIBUTING.md](CONTRIBUTING.md). المسائل الأمنية والإبلاغات في [SECURITY.md](SECURITY.md).
