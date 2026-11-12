/**
 * kit/providers/_schema.mjs — 极简 JSON Schema 校验
 *
 * 为什么自己写：
 *   providers 的 schema 只需要覆盖 function calling 常用的那几种类型
 *   （string / number / integer / boolean / array / object + required + enum）。
 *   引 ajv 要多 200KB 依赖，为这点需求不值。
 *
 * 校验失败一律返回错误字符串数组，不抛异常 —— 让调用方决定怎么处理。
 */

const TYPE_CHECKS = {
  string: v => typeof v === 'string',
  number: v => typeof v === 'number' && Number.isFinite(v),
  integer: v => Number.isInteger(v),
  boolean: v => typeof v === 'boolean',
  array: v => Array.isArray(v),
  object: v => v !== null && typeof v === 'object' && !Array.isArray(v),
  null: v => v === null,
};

/**
 * 校验一个值是否符合 schema
 * @param {any} value
 * @param {object} schema
 * @param {string} path  用于错误信息定位
 * @returns {string[]} 错误列表（空 = 通过）
 */
export function validate(value, schema, path = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;

  // type
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = types.some(t => TYPE_CHECKS[t] ? TYPE_CHECKS[t](value) : true);
    if (!ok) {
      errs.push(`${path}: 期望类型 ${types.join('|')}，实际 ${describe(value)}`);
      return errs;   // 类型不对就别往下查了
    }
  }

  // enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.some(e => Object.is(e, value))) {
      errs.push(`${path}: 值 ${JSON.stringify(value)} 不在枚举 ${JSON.stringify(schema.enum)} 内`);
    }
  }

  // const
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    if (!Object.is(schema.const, value)) {
      errs.push(`${path}: 期望常量 ${JSON.stringify(schema.const)}`);
    }
  }

  // 数值范围
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} < 最小 ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} > 最大 ${schema.maximum}`);
  }

  // 字符串长度
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: 长度 ${value.length} < ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: 长度 ${value.length} > ${schema.maxLength}`);
  }

  // 数组
  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errs.push(...validate(v, schema.items, `${path}[${i}]`)));
  }

  // 对象
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties || {};
    for (const key of (schema.required || [])) {
      if (!(key in value)) errs.push(`${path}.${key}: 必填缺失`);
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) errs.push(...validate(value[key], sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errs.push(`${path}.${key}: 不允许的额外字段`);
      }
    }
  }

  return errs;
}

function describe(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * 校验一个 provider 模块的形状。
 * 约定（照 jarvis 的 provide() 改写）：
 *
 *   export const TOOL = { name, description, parameters: JSONSchema }
 *   export const HINT = "可选，追加到提示词"
 *   export async function run(args) { return { ok, ... } }
 *
 * 或者多工具形态：
 *   export function provide() { return [[TOOL1, fn1], [TOOL2, fn2]]; }
 */
export function validateProvider(mod, file = '') {
  const errs = [];

  const tools = [];
  if (typeof mod.provide === 'function') {
    let out;
    try { out = mod.provide(); }
    catch (e) { errs.push(`${file}: provide() 抛异常: ${e.message}`); return { errs, tools }; }
    if (!Array.isArray(out)) {
      errs.push(`${file}: provide() 必须返回数组`);
      return { errs, tools };
    }
    for (const pair of out) {
      if (!Array.isArray(pair) || pair.length !== 2) { errs.push(`${file}: provide() 每项必须是 [TOOL, fn]`); continue; }
      const [tool, fn] = pair;
      const e = checkTool(tool, fn, file);
      errs.push(...e);
      if (!e.length) tools.push({ tool, fn });
    }
  } else if (mod.TOOL) {
    const e = checkTool(mod.TOOL, mod.run, file);
    errs.push(...e);
    if (!e.length) tools.push({ tool: mod.TOOL, fn: mod.run });
  } else {
    errs.push(`${file}: 既没有 TOOL/run 也没有 provide()`);
  }

  return { errs, tools };
}

function checkTool(tool, fn, file) {
  const errs = [];
  if (!tool || typeof tool !== 'object') { errs.push(`${file}: TOOL 不是对象`); return errs; }
  if (!tool.name || typeof tool.name !== 'string') errs.push(`${file}: TOOL.name 缺失或非字符串`);
  else if (!/^[a-z][a-z0-9_]*$/i.test(tool.name)) errs.push(`${file}: TOOL.name "${tool.name}" 必须是字母数字下划线`);
  if (!tool.description || typeof tool.description !== 'string') errs.push(`${file}: TOOL.description 缺失`);
  if (!tool.parameters || tool.parameters.type !== 'object') errs.push(`${file}: TOOL.parameters 必须是 type:object 的 JSONSchema`);
  if (typeof fn !== 'function') errs.push(`${file}: 处理函数不是函数`);
  return errs;
}
