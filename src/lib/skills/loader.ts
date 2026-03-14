import { tool } from 'ai'
import { z } from 'zod'
import { executeTool } from '@/lib/tools/router'
import fs from 'fs'
import path from 'path'

interface SkillParameter {
  type: 'string' | 'number' | 'boolean' | 'array'
  required: boolean
  description: string
  items?: { type: string }
  enum?: string[]
}

interface SkillDefinition {
  name: string
  description: string
  category: string
  auto_approve: boolean
  worker_url: string
  parameters: Record<string, SkillParameter>
  thinking_message: string
}

function buildZodSchema(parameters: Record<string, SkillParameter>) {
  const shape: Record<string, z.ZodTypeAny> = {}
  
  for (const [key, param] of Object.entries(parameters)) {
    let schema: z.ZodTypeAny
    
    switch (param.type) {
      case 'number':
        schema = z.number().describe(param.description)
        break
      case 'boolean':
        schema = z.boolean().describe(param.description)
        break
      case 'array':
        schema = z.array(z.string()).describe(param.description)
        break
      default:
        schema = z.string().describe(param.description)
    }
    
    if (param.enum) {
      schema = z.enum(param.enum as [string, ...string[]]).describe(param.description)
    }
    
    shape[key] = param.required ? schema : schema.optional()
  }
  
  return z.object(shape)
}

export function loadSkills(data: any): Record<string, any> {
  const skillsDir = path.join(process.cwd(), 'src/skills')
  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.json'))
  
  const tools: Record<string, any> = {}
  
  for (const file of files) {
    const skillPath = path.join(skillsDir, file)
    const skill: SkillDefinition = JSON.parse(fs.readFileSync(skillPath, 'utf-8'))
    
    const schema = buildZodSchema(skill.parameters)
    const thinkingMessage = skill.thinking_message
    const toolName = skill.name.replace(/_/g, '-')
    
    tools[skill.name] = tool({
      description: skill.description,
      parameters: schema,
      execute: async (args) => {
        const message = thinkingMessage.replace(
          /\{(\w+)\}/g,
          (_, key) => String((args as any)[key] ?? '')
        )
        if (data && typeof data.append === 'function') {
          data.append({ type: 'thinking', step: message })
        }
        return executeTool(toolName, args as Record<string, unknown>)
      }
    })
  }
  
  return tools
}
