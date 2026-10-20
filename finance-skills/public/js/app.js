document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
  const themeValue = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = themeValue;
  try { localStorage.setItem('finance-theme', themeValue); } catch {}
}));
document.querySelectorAll('[data-fiscal-form]').forEach(form => {
  const yearSelect = form.querySelector('[name="fiscal_year_id"]');
  const quarterSelect = form.querySelector('[name="quarter"]');
  const startInput = form.querySelector(form.dataset.start || '[name="starts_on"]');
  const endInput = form.querySelector(form.dataset.end || '[name="ends_on"]');
  const exceptionInput = form.querySelector('[name="exception_reason"]');
  const errorText = form.querySelector('[data-date-error]');
  const otherInput = form.querySelector('[name="other_category"]');
  const categorySelect = form.querySelector('[name="category"]');
  const isoDate = dateValue => `${dateValue.getUTCFullYear()}-${String(dateValue.getUTCMonth()+1).padStart(2,'0')}-${String(dateValue.getUTCDate()).padStart(2,'0')}`;
  function validateDates() {
    let message = '';
    const yearValue = Number(yearSelect.selectedOptions[0]?.dataset.year);
    const quarterValue = Number(quarterSelect.value);
    let low = '', high = '';
    if (yearValue) {
      const firstMonth = quarterValue ? 9 + (quarterValue - 1) * 3 : 9;
      low = isoDate(new Date(Date.UTC(yearValue - 544, firstMonth, 1)));
      high = isoDate(new Date(Date.UTC(yearValue - 544, firstMonth + (quarterValue ? 3 : 12), 0)));
    }
    const crossQuarter = Boolean(exceptionInput?.value.trim());
    startInput.min = low; startInput.max = high;
    endInput.min = startInput.value && startInput.value > low ? startInput.value : low;
    endInput.max = crossQuarter ? '' : high;
    if (startInput.value && endInput.value && endInput.value < startInput.value) message = 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม';
    else if (startInput.value && low && (startInput.value < low || startInput.value > high)) message = 'วันที่เริ่มไม่ตรงกับปีงบประมาณและไตรมาสที่เลือก กรุณาแก้ไขวันที่';
    else if (endInput.value && high && !crossQuarter && endInput.value > high) message = 'วันที่สิ้นสุดอยู่นอกช่วงที่เลือก กรุณาแก้ไข หรือระบุเหตุผลกิจกรรมข้ามไตรมาส';
    endInput.setCustomValidity(message);
    if (errorText) errorText.textContent = message;
    form.querySelectorAll('button[type="submit"],button:not([type])').forEach(button => { button.disabled = Boolean(message); });
    if (otherInput && categorySelect) {
      const isOther = categorySelect.value === 'other';
      otherInput.required = isOther; otherInput.closest('[data-other-field]')?.toggleAttribute('hidden', !isOther);
    }
  }
  startInput.addEventListener('change', () => {
    if (startInput.value && !quarterSelect.value) {
      const [yearPart, monthPart] = startInput.value.split('-').map(Number);
      const fiscalYear = yearPart + 543 + (monthPart >= 10 ? 1 : 0);
      const matchingYear = [...yearSelect.options].find(option => Number(option.dataset.year) === fiscalYear);
      if (matchingYear) { yearSelect.value = matchingYear.value; quarterSelect.value = String(Math.floor(((monthPart + 2) % 12) / 3) + 1); }
    }
    validateDates();
  });
  [yearSelect,quarterSelect,endInput,exceptionInput,categorySelect].filter(Boolean).forEach(input => input.addEventListener('input',validateDates));
  validateDates();
});
document.querySelectorAll('[data-person-select]').forEach(select => {
  const linked = document.querySelector('[name="plan_item_id"]'); if (!linked) return;
  function matchOwner() { [...linked.options].forEach(option => { if(option.dataset.person) option.hidden = option.dataset.person !== select.value; }); if (linked.selectedOptions[0]?.hidden) linked.value = ''; }
  select.addEventListener('change',matchOwner); matchOwner();
});
document.querySelectorAll('form').forEach(form => form.addEventListener('submit', submitEvent => {
  if (!form.checkValidity()) return;
  const submitButton = submitEvent.submitter;
  if (submitButton && !submitButton.dataset.keepEnabled) {
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.disabled = true; submitButton.textContent = submitButton.dataset.busyLabel || 'กำลังดำเนินการ…'; submitButton.setAttribute('aria-busy','true');
  }
}));
window.addEventListener('pageshow', () => document.querySelectorAll('[data-original-text]').forEach(button => { button.textContent = button.dataset.originalText; button.disabled = false; button.removeAttribute('aria-busy'); }));
