Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Мост между JS и ActivityKit для Live Activity скана чека'
  s.description    = 'Локальный модуль Wailet: запуск, обновление и завершение Live Activity.'
  s.author         = 'Wailet'
  s.homepage       = 'https://github.com/dilukliu0-cyber/woilet'
  s.license        = { :type => 'MIT' }
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
