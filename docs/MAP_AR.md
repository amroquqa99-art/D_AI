# D_AI — خريطة المستودع (عربية)

هذه الخريطة توضح ما هو كل مجلد رئيسي وكل ملف مهم، ومن يقرأ أولاً، والروابط بينها. هي خريطة دخول للمستودع، ليست بديلًا عن README.md ولا تكرار له.

## المجلدات الرئيسية في الجذر
- src/dai/ — النواة: contracts.py (العقود، الهويات، النطاقات)، errors.py (الأخطاء المسمّاة)، memory.py (الذاكرة المشفرة ثلاثية النطاقات person/project/global مع الأرشفة والمحو)، vault.py (المفاتيح والتشفير)، charters.py (عقود التأسيس والموافقة)، tasks.py (رسم المهام الدائم وآلة الحالات)، decisions.py (القرارات والتجاوز والإلغاء)، teams.py (الفرق، الوكلاء، الرسائل، الاستشارات داخل الجلسة)، models.py (سجل النماذج، التوجيه الصادق للتكلفة، القياس)، tools.py (بوابة الأدوات وآثار الأذونات)، components.py (سجل المكونات الخارجية والترخيص)، updates.py (مراقب التحديث الأسبوعي)، cli.py (واجهة الأوامر).
- adapters/ — وصلات المضيفين: adapters/opencode/ (الوكلاء، الأوامر، الم MCP، الراوتر Dai الأصلي، حزم المهارات)، adapters/pi/ (وصلات pi).
- systems/ — مواصفات وقدرات ومناهج الأنظمة العشر (البحث العلمي، الابتكار، التعلم، الاستثمار، المساعد الشخصي، التحقيق، الأمن السيبراني، التحليل الاستراتيجي والعسكري، المستشارون، الهندسة والإنتاج الرقمي): كل نظام فيه README.md و specification.md.
- packs/ — حزم قدرات محددة المصدر والنسخة (playbook-router, seat-role-spec, severity-escalation).
- config/ — model-profiles.json (ملفات النماذج)، routing-preferences.json (تفضيلات التوجيه)، systems.json.
- scripts/ — install_opencode.py (التثبيت)، verify_install.py (التحقق من التثبيت).
- tests/ — اختبارات النواة بـ unittest (test_memory, test_charters, test_tasks, ...) واختبار الراوتر router.test.mjs.
- docs/ — المواصفات (PRD_AR.md)، المعمارية والعقود (MODULE_CONTRACTs.md)، هذه الخريطة (MAP_AR.md)، تغطية المتطلبات (REQUIREMENT_COVERAGE.json)، حالة التنفيذ (IMPLEMENTATION_STATE.md)، أدلة الإثبات المنشورة (docs/evidence/).

## الملفات المهمة في الجذر
- README.md — دخول عربي وروابط التشغيل والحالة. README.en.md — النسخة الإنجليزية.
- PRD_AR.md — وثيقة متطلبات المنتج؛ المصدر لكل معرف متطلب (REL-xx, INV-xx, ACT-xx, INT-xx, WFL-xx, AGT-xx, SIDE-xx, ENV-xx, MEM-xx, MOD-xx, RES-xx, UPD-xx, SYS-xx, SCI-xx, VIS-xx, EXT-xx, DAT-xx, REP-xx).
- PRD_D_AI_V0.1_AR.md — مسودة المتطلبات الأقدم.
- INSTALL.md، CONTRIBUTING.md، SECURITY.md، THIRD_PARTY.md، GLOSSARY.md، LICENSE (GPL-3.0-or-later)، AGENTS.md (تعليمات العمل في هذه الجلسة).

## الروابط بين الملفات
PRD_AR.md هو المصدر المرجعي لكل معرف متطلب → REQUIREMENT_COVERAGE.json تسجل حالة كل معرف مع الإثبات والفجوة → IMPLEMENTATION_STATE.md نقطة التفتيش التنفيذية التي تستند إلى التغطية → MODULE_CONTRACTs.md العقود الملزمة للتنفيذ → src/dai/ الكود المنفذ → tests/ الإثبات التلقائي → RELEASE_AUDIT_2026-10-21.json (في docs/evidence/) إيصال التدقيق للإصدار.

## من يقرأ أولاً
1. README.md للتعرف على المشروع وكيفية التشغيل.
2. PRD_AR.md لفهم المتطلبات ومعرفاتها.
3. REQUIREMENT_COVERAGE.json لمعرفة ما ثبت وما لم يثبت ولماذا.
4. IMPLEMENTATION_STATE.md لحالة الإصدار والخطوات المتبقية.

## كيف أتحقق بنفسي
```bash
cd "/run/media/amro/18D1-F040/01 Projects/D_AI"
PYTHONPATH=src /home/amro/.local/share/d-ai-opencode/venv/bin/python -m unittest discover -s tests
node --test tests/router.test.mjs
PYTHONPATH=src python scripts/verify_install.py --skip-data-root
git rev-parse HEAD
```
النتيجة المتوقعة المسجلة في 2026-10-21: 184 اختبارًا ناجحًا (OK)، 32 اختبار راوتر ناجحًا بدون إخفاق، والتحقق من التثبيت يُظهر ok=false بسبب غياب وحدة "cryptography" في البيئة الافتراضية (حد معروف، مسجل في حدود RELEASE_AUDIT_2026-10-21.json).

## حدود هذه الخريطة
لا تغطي الخريطة الأسطح المضيفة الأربعة (OpenCode Desktop، pi CLI، PI-Desktop) لأنها غير مثبتة ولم تُتحقق على نسخ مثبتة مسجلة. لا إذن بالنشر أو الالتزام أو أي إجراء خارجي من هذه الجلسة؛ هذا المستند للتسجيل فقط.
